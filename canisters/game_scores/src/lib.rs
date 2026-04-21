//! Multi-game scoreboard canister.
//!
//! Decoupled from points_ledger so leaderboard iteration (scoring
//! rules, anti-cheat tweaks, decay curves) doesn't touch the money
//! layer. Designed to host any number of game tags — stacker first,
//! but a future "dunk" or "stacker_v2" mode just passes its own
//! game-tag string and gets its own ranked buckets.
//!
//! Storage shape (all in stable memory):
//!
//!   GAME_TOP_ALLTIME  (game, score, principal, ts)  bounded top-100 per game
//!   GAME_TOP_TODAY    (game, score, principal, ts)  bounded top-50 per game,
//!                                                    cleared on UTC day rollover
//!   PER_PRINCIPAL_LOG (principal, game) -> last 32 runs (ring buffer)
//!   SUBMIT_RATE       (principal) -> ring buffer of submission timestamps
//!
//! Leaderboard reads are O(K) memory copies. Submissions are O(log K)
//! into each bucket (heap ops). Per-principal stats (best score, total
//! runs, last run) are derived from the ring buffer.

use candid::{CandidType, Nat, Principal};
use ic_cdk::{init, query, update};
use ic_stable_structures::memory_manager::{MemoryId, MemoryManager, VirtualMemory};
use ic_stable_structures::{DefaultMemoryImpl, StableBTreeMap, StableCell, Storable};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::cell::RefCell;

type Memory = VirtualMemory<DefaultMemoryImpl>;

// -------------------------------------------------------------------
// Configuration
// -------------------------------------------------------------------

/// Max characters in a game tag. Keeps the storable key fixed-width.
const GAME_TAG_MAX: usize = 32;

/// Cap on top-K kept per game per period.
const TOP_ALLTIME_K: usize = 100;
const TOP_TODAY_K: usize = 50;

/// Per-principal-per-game run history depth. Ring-buffered.
const RUN_HISTORY_DEPTH: usize = 32;

/// Submission rate-limit windows. Same FaucetClaims pattern from
/// points_ledger — bounded ring buffer of timestamps, count entries
/// in trailing windows. Per-principal across ALL games (not per game)
/// because a sybil could otherwise spam by rotating game tags.
const SUBMIT_RING_SIZE: usize = 256;
struct RateLimit {
    window_ns: u64,
    max: u32,
    label: &'static str,
}
const SUBMIT_LIMITS: &[RateLimit] = &[
    RateLimit {
        window_ns: 60 * 1_000_000_000,
        max: 6,
        label: "minute",
    },
    RateLimit {
        window_ns: 60 * 60 * 1_000_000_000,
        max: 60,
        label: "hour",
    },
    RateLimit {
        window_ns: 24 * 60 * 60 * 1_000_000_000,
        max: 200,
        label: "day",
    },
];

const NS_PER_DAY: u64 = 24 * 60 * 60 * 1_000_000_000;

// -------------------------------------------------------------------
// Storable helpers
// -------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct GameTag([u8; GAME_TAG_MAX]);

impl GameTag {
    fn from_str(s: &str) -> Result<Self, ScoreError> {
        let bytes = s.as_bytes();
        if bytes.is_empty() {
            return Err(ScoreError::GameTagEmpty);
        }
        if bytes.len() > GAME_TAG_MAX {
            return Err(ScoreError::GameTagTooLong { max: GAME_TAG_MAX as u32 });
        }
        // Allowlist: lowercase ascii letters, digits, underscore. Avoids
        // Unicode shenanigans + keeps the tag URL/log-friendly.
        for b in bytes {
            let ok = (*b >= b'a' && *b <= b'z')
                || (*b >= b'0' && *b <= b'9')
                || *b == b'_';
            if !ok {
                return Err(ScoreError::GameTagInvalidChar);
            }
        }
        let mut buf = [0u8; GAME_TAG_MAX];
        buf[..bytes.len()].copy_from_slice(bytes);
        Ok(GameTag(buf))
    }

    fn to_string(&self) -> String {
        let n = self.0.iter().position(|&b| b == 0).unwrap_or(GAME_TAG_MAX);
        String::from_utf8_lossy(&self.0[..n]).into_owned()
    }
}

impl Storable for GameTag {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Borrowed(&self.0)
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let mut buf = [0u8; GAME_TAG_MAX];
        buf.copy_from_slice(&bytes[..GAME_TAG_MAX]);
        GameTag(buf)
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: GAME_TAG_MAX as u32,
            is_fixed_size: true,
        };
}

/// Fixed-length principal wrapper (1 length byte + up to 29 bytes).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct PrincipalKey([u8; 30]);

impl PrincipalKey {
    fn from_principal(p: &Principal) -> Self {
        let mut buf = [0u8; 30];
        let slice = p.as_slice();
        buf[0] = slice.len() as u8;
        buf[1..=slice.len()].copy_from_slice(slice);
        PrincipalKey(buf)
    }
    fn to_principal(&self) -> Principal {
        let n = self.0[0] as usize;
        Principal::from_slice(&self.0[1..=n])
    }
}

impl Storable for PrincipalKey {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Borrowed(&self.0)
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let mut buf = [0u8; 30];
        buf.copy_from_slice(&bytes[..30]);
        PrincipalKey(buf)
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: 30,
            is_fixed_size: true,
        };
}

/// Composite key (game, principal) for the per-principal-per-game log map.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct GamePrincipalKey {
    game: GameTag,
    principal: PrincipalKey,
}

const GP_KEY_SIZE: usize = GAME_TAG_MAX + 30;

impl Storable for GamePrincipalKey {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        let mut buf = Vec::with_capacity(GP_KEY_SIZE);
        buf.extend_from_slice(&self.game.0);
        buf.extend_from_slice(&self.principal.0);
        Cow::Owned(buf)
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let mut g = [0u8; GAME_TAG_MAX];
        let mut p = [0u8; 30];
        g.copy_from_slice(&bytes[..GAME_TAG_MAX]);
        p.copy_from_slice(&bytes[GAME_TAG_MAX..GAME_TAG_MAX + 30]);
        GamePrincipalKey {
            game: GameTag(g),
            principal: PrincipalKey(p),
        }
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: GP_KEY_SIZE as u32,
            is_fixed_size: true,
        };
}

// -------------------------------------------------------------------
// Top-K bucket per game per period
// -------------------------------------------------------------------
//
// Layout: a single u8 length prefix + K * EntrySize fixed-size slots.
// Sorted DESCENDING by score; on insert we binary-search the position,
// shift entries down, and (when full) drop the lowest. This avoids
// any heap allocation in the canister; everything fits in one bounded
// stable-btree value.
//
// Per-entry layout (54 bytes):
//   u64 score        (8)
//   u64 ts_ns        (8)
//   u32 streak       (4)
//   u32 reserved     (4)  — future scoring-rule fields without bumping size
//   PrincipalKey     (30)
//
// 8+8+4+4+30 = 54.

const ENTRY_BYTES: usize = 54;
const TOP_K_MAX: usize = TOP_ALLTIME_K; // larger of the two — bucket sizing

#[derive(Clone, Copy, Debug)]
struct ScoreSlot {
    principal: PrincipalKey,
    score: u64,
    ts_ns: u64,
    streak: u32,
    reserved: u32,
}

#[derive(Clone, Debug, Default)]
struct TopBucket {
    /// Entries, sorted score-DESC, newer-first on ties.
    entries: Vec<ScoreSlot>,
}

impl TopBucket {
    /// Capacity is a runtime arg passed by the caller — same Storable
    /// shape works for both K=100 and K=50 buckets.
    fn insert(&mut self, slot: ScoreSlot, capacity: usize) {
        // Sort key: higher score first; tie-break newer first so a
        // recent-tie shows ahead of a stale-tie.
        let pos = self
            .entries
            .iter()
            .position(|e| {
                slot.score > e.score
                    || (slot.score == e.score && slot.ts_ns > e.ts_ns)
            })
            .unwrap_or(self.entries.len());
        self.entries.insert(pos, slot);
        if self.entries.len() > capacity {
            self.entries.truncate(capacity);
        }
    }
}

impl Storable for TopBucket {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        const SIZE: usize = 1 + TOP_K_MAX * ENTRY_BYTES;
        let mut buf = vec![0u8; SIZE];
        buf[0] = self.entries.len().min(TOP_K_MAX) as u8;
        for (i, e) in self.entries.iter().take(TOP_K_MAX).enumerate() {
            let off = 1 + i * ENTRY_BYTES;
            buf[off..off + 8].copy_from_slice(&e.score.to_le_bytes());
            buf[off + 8..off + 16].copy_from_slice(&e.ts_ns.to_le_bytes());
            buf[off + 16..off + 20].copy_from_slice(&e.streak.to_le_bytes());
            buf[off + 20..off + 24].copy_from_slice(&e.reserved.to_le_bytes());
            buf[off + 24..off + 24 + 30].copy_from_slice(&e.principal.0);
        }
        Cow::Owned(buf)
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let n = bytes[0] as usize;
        let mut entries = Vec::with_capacity(n);
        for i in 0..n {
            let off = 1 + i * ENTRY_BYTES;
            let mut s = [0u8; 8];
            let mut t = [0u8; 8];
            let mut k = [0u8; 4];
            let mut r = [0u8; 4];
            let mut p = [0u8; 30];
            s.copy_from_slice(&bytes[off..off + 8]);
            t.copy_from_slice(&bytes[off + 8..off + 16]);
            k.copy_from_slice(&bytes[off + 16..off + 20]);
            r.copy_from_slice(&bytes[off + 20..off + 24]);
            p.copy_from_slice(&bytes[off + 24..off + 24 + 30]);
            entries.push(ScoreSlot {
                score: u64::from_le_bytes(s),
                ts_ns: u64::from_le_bytes(t),
                streak: u32::from_le_bytes(k),
                reserved: u32::from_le_bytes(r),
                principal: PrincipalKey(p),
            });
        }
        TopBucket { entries }
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: (1 + TOP_K_MAX * ENTRY_BYTES) as u32,
            is_fixed_size: true,
        };
}

// -------------------------------------------------------------------
// Per-principal-per-game run history (ring buffer of last N runs)
// -------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Default)]
struct RunSlot {
    score: u64,
    ts_ns: u64,
    streak: u32,
    reserved: u32, // future flags (mode, perfect, etc.)
}

#[derive(Clone, Debug, Default)]
struct RunHistory {
    head: u32, // next slot to write
    len: u32,  // filled count, saturates at depth
    runs: [RunSlot; RUN_HISTORY_DEPTH],
    /// Lifetime totals — kept so a "best score, total runs" view doesn't
    /// have to scan the ring.
    best_score: u64,
    total_runs: u64,
    sum_scores: u64, // for derived avg (sum / total)
    last_ts_ns: u64,
}

impl RunHistory {
    fn push(&mut self, slot: RunSlot) {
        let i = self.head as usize % RUN_HISTORY_DEPTH;
        self.runs[i] = slot;
        self.head = (self.head + 1) % RUN_HISTORY_DEPTH as u32;
        if (self.len as usize) < RUN_HISTORY_DEPTH {
            self.len += 1;
        }
        if slot.score > self.best_score {
            self.best_score = slot.score;
        }
        self.total_runs = self.total_runs.saturating_add(1);
        self.sum_scores = self.sum_scores.saturating_add(slot.score);
        self.last_ts_ns = slot.ts_ns;
    }

    fn iter_chronological(&self) -> Vec<RunSlot> {
        let n = self.len as usize;
        if n == 0 {
            return Vec::new();
        }
        let start = (self.head as usize + RUN_HISTORY_DEPTH - n) % RUN_HISTORY_DEPTH;
        let mut out = Vec::with_capacity(n);
        for i in 0..n {
            out.push(self.runs[(start + i) % RUN_HISTORY_DEPTH]);
        }
        out
    }
}

const RUN_HISTORY_BYTES: usize =
    4 // head
    + 4 // len
    + RUN_HISTORY_DEPTH * 24 // each RunSlot serializes to 24 bytes
    + 8 // best_score
    + 8 // total_runs
    + 8 // sum_scores
    + 8; // last_ts_ns

impl Storable for RunHistory {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        let mut buf = vec![0u8; RUN_HISTORY_BYTES];
        buf[0..4].copy_from_slice(&self.head.to_le_bytes());
        buf[4..8].copy_from_slice(&self.len.to_le_bytes());
        for (i, r) in self.runs.iter().enumerate() {
            let off = 8 + i * 24;
            buf[off..off + 8].copy_from_slice(&r.score.to_le_bytes());
            buf[off + 8..off + 16].copy_from_slice(&r.ts_ns.to_le_bytes());
            buf[off + 16..off + 20].copy_from_slice(&r.streak.to_le_bytes());
            buf[off + 20..off + 24].copy_from_slice(&r.reserved.to_le_bytes());
        }
        let tail = 8 + RUN_HISTORY_DEPTH * 24;
        buf[tail..tail + 8].copy_from_slice(&self.best_score.to_le_bytes());
        buf[tail + 8..tail + 16].copy_from_slice(&self.total_runs.to_le_bytes());
        buf[tail + 16..tail + 24].copy_from_slice(&self.sum_scores.to_le_bytes());
        buf[tail + 24..tail + 32].copy_from_slice(&self.last_ts_ns.to_le_bytes());
        Cow::Owned(buf)
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let mut head = [0u8; 4];
        let mut len = [0u8; 4];
        head.copy_from_slice(&bytes[..4]);
        len.copy_from_slice(&bytes[4..8]);
        let mut runs = [RunSlot::default(); RUN_HISTORY_DEPTH];
        for i in 0..RUN_HISTORY_DEPTH {
            let off = 8 + i * 24;
            let mut s = [0u8; 8];
            let mut t = [0u8; 8];
            let mut k = [0u8; 4];
            let mut r = [0u8; 4];
            s.copy_from_slice(&bytes[off..off + 8]);
            t.copy_from_slice(&bytes[off + 8..off + 16]);
            k.copy_from_slice(&bytes[off + 16..off + 20]);
            r.copy_from_slice(&bytes[off + 20..off + 24]);
            runs[i] = RunSlot {
                score: u64::from_le_bytes(s),
                ts_ns: u64::from_le_bytes(t),
                streak: u32::from_le_bytes(k),
                reserved: u32::from_le_bytes(r),
            };
        }
        let tail = 8 + RUN_HISTORY_DEPTH * 24;
        let mut bs = [0u8; 8];
        let mut tr = [0u8; 8];
        let mut ss = [0u8; 8];
        let mut lt = [0u8; 8];
        bs.copy_from_slice(&bytes[tail..tail + 8]);
        tr.copy_from_slice(&bytes[tail + 8..tail + 16]);
        ss.copy_from_slice(&bytes[tail + 16..tail + 24]);
        lt.copy_from_slice(&bytes[tail + 24..tail + 32]);
        RunHistory {
            head: u32::from_le_bytes(head),
            len: u32::from_le_bytes(len),
            runs,
            best_score: u64::from_le_bytes(bs),
            total_runs: u64::from_le_bytes(tr),
            sum_scores: u64::from_le_bytes(ss),
            last_ts_ns: u64::from_le_bytes(lt),
        }
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: RUN_HISTORY_BYTES as u32,
            is_fixed_size: true,
        };
}

// -------------------------------------------------------------------
// Submit-rate ring buffer (per-principal across all games)
// -------------------------------------------------------------------

#[derive(Clone, Copy, Debug)]
struct RateBuf {
    head: u32,
    len: u32,
    ring: [u64; SUBMIT_RING_SIZE],
}

impl Default for RateBuf {
    fn default() -> Self {
        Self {
            head: 0,
            len: 0,
            ring: [0u64; SUBMIT_RING_SIZE],
        }
    }
}

impl RateBuf {
    fn push(&mut self, ts: u64) {
        let i = self.head as usize % SUBMIT_RING_SIZE;
        self.ring[i] = ts;
        self.head = (self.head + 1) % SUBMIT_RING_SIZE as u32;
        if (self.len as usize) < SUBMIT_RING_SIZE {
            self.len += 1;
        }
    }
    fn iter_chronological(&self) -> Vec<u64> {
        let n = self.len as usize;
        if n == 0 {
            return Vec::new();
        }
        let start = (self.head as usize + SUBMIT_RING_SIZE - n) % SUBMIT_RING_SIZE;
        let mut out = Vec::with_capacity(n);
        for i in 0..n {
            out.push(self.ring[(start + i) % SUBMIT_RING_SIZE]);
        }
        out
    }
    fn count_in_window(&self, now: u64, window: u64) -> u32 {
        let cutoff = now.saturating_sub(window);
        self.iter_chronological()
            .into_iter()
            .filter(|&t| t >= cutoff)
            .count() as u32
    }
}

const RATE_BYTES: usize = 8 + SUBMIT_RING_SIZE * 8;
impl Storable for RateBuf {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        let mut buf = vec![0u8; RATE_BYTES];
        buf[0..4].copy_from_slice(&self.head.to_le_bytes());
        buf[4..8].copy_from_slice(&self.len.to_le_bytes());
        for (i, t) in self.ring.iter().enumerate() {
            let off = 8 + i * 8;
            buf[off..off + 8].copy_from_slice(&t.to_le_bytes());
        }
        Cow::Owned(buf)
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let mut h = [0u8; 4];
        let mut l = [0u8; 4];
        h.copy_from_slice(&bytes[..4]);
        l.copy_from_slice(&bytes[4..8]);
        let mut ring = [0u64; SUBMIT_RING_SIZE];
        for i in 0..SUBMIT_RING_SIZE {
            let off = 8 + i * 8;
            let mut t = [0u8; 8];
            t.copy_from_slice(&bytes[off..off + 8]);
            ring[i] = u64::from_le_bytes(t);
        }
        RateBuf {
            head: u32::from_le_bytes(h),
            len: u32::from_le_bytes(l),
            ring,
        }
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: RATE_BYTES as u32,
            is_fixed_size: true,
        };
}

// -------------------------------------------------------------------
// "Today" bucket day-stamp tracking
// -------------------------------------------------------------------
//
// Each per-game today bucket carries the day_epoch it was last
// written under. On read/write, if the stamp's day != current day,
// the bucket is treated as empty and overwritten. Lazy reset, no
// cron needed.

#[derive(Clone, Copy, Debug, Default)]
struct DayStamp(u64);

impl Storable for DayStamp {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(self.0.to_le_bytes().to_vec())
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let mut b = [0u8; 8];
        b.copy_from_slice(&bytes[..8]);
        DayStamp(u64::from_le_bytes(b))
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: 8,
            is_fixed_size: true,
        };
}

// -------------------------------------------------------------------
// Memory IDs + thread-local stores
// -------------------------------------------------------------------

const TOP_ALLTIME_MEM: MemoryId = MemoryId::new(0);
const TOP_TODAY_MEM: MemoryId = MemoryId::new(1);
const TOP_TODAY_STAMP_MEM: MemoryId = MemoryId::new(2);
const RUN_HISTORY_MEM: MemoryId = MemoryId::new(3);
const RATE_MEM: MemoryId = MemoryId::new(4);
const CONFIG_MEM: MemoryId = MemoryId::new(5);

#[derive(CandidType, Deserialize, Serialize, Clone, Debug, Default)]
pub struct InitArgs {
    /// Optional related ledger principal — stored for telemetry/audit;
    /// the canister doesn't make inter-canister calls in v1, but
    /// tagging the deploy lets future inspectors verify which ledger
    /// these scores were coupled with.
    pub related_ledger: Option<Principal>,
}

impl Storable for InitArgs {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(candid::encode_one(self).unwrap())
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        candid::decode_one(&bytes).unwrap()
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Unbounded;
}

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));

    /// All-time top-100 per game. Key = GameTag.
    static TOP_ALLTIME: RefCell<StableBTreeMap<GameTag, TopBucket, Memory>> =
        RefCell::new(StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(TOP_ALLTIME_MEM)),
        ));

    /// Today top-50 per game.
    static TOP_TODAY: RefCell<StableBTreeMap<GameTag, TopBucket, Memory>> =
        RefCell::new(StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(TOP_TODAY_MEM)),
        ));

    /// Day epoch the today bucket was last written under (per game).
    static TOP_TODAY_STAMP: RefCell<StableBTreeMap<GameTag, DayStamp, Memory>> =
        RefCell::new(StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(TOP_TODAY_STAMP_MEM)),
        ));

    /// Per-(game, principal) run history.
    static RUN_HISTORY_MAP: RefCell<StableBTreeMap<GamePrincipalKey, RunHistory, Memory>> =
        RefCell::new(StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(RUN_HISTORY_MEM)),
        ));

    /// Per-principal submission timestamps for rate limits.
    static RATE_MAP: RefCell<StableBTreeMap<PrincipalKey, RateBuf, Memory>> =
        RefCell::new(StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(RATE_MEM)),
        ));

    static CONFIG: RefCell<StableCell<InitArgs, Memory>> = RefCell::new({
        let mem = MEMORY_MANAGER.with(|m| m.borrow().get(CONFIG_MEM));
        StableCell::init(mem, InitArgs::default()).expect("init config cell")
    });
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

#[init]
fn init(args: InitArgs) {
    CONFIG.with(|c| {
        c.borrow_mut().set(args).expect("set config");
    });
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct SubmitArgs {
    pub game: String,
    pub score: u64,
    pub streak: u32,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct SubmitOk {
    pub principal: Principal,
    pub game: String,
    pub score: u64,
    pub ts_ns: u64,
    pub all_time_rank: Option<u32>,
    pub today_rank: Option<u32>,
    pub new_personal_best: bool,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum ScoreError {
    AnonymousCaller,
    GameTagEmpty,
    GameTagTooLong { max: u32 },
    GameTagInvalidChar,
    ScoreZero,
    RateLimited {
        window_label: String,
        max: u32,
        seconds_until_next: u64,
    },
}

#[update]
fn submit_score(args: SubmitArgs) -> Result<SubmitOk, ScoreError> {
    let caller = ic_cdk::api::caller();
    if caller == Principal::anonymous() {
        return Err(ScoreError::AnonymousCaller);
    }
    if args.score == 0 {
        return Err(ScoreError::ScoreZero);
    }
    let game = GameTag::from_str(&args.game)?;
    let now = ic_cdk::api::time();

    // Rate-limit: per-principal across all games.
    let pkey = PrincipalKey::from_principal(&caller);
    let mut rate = RATE_MAP.with(|r| r.borrow().get(&pkey).unwrap_or_default());
    for w in SUBMIT_LIMITS {
        let count = rate.count_in_window(now, w.window_ns);
        if count >= w.max {
            let ts = rate.iter_chronological();
            let cutoff = now.saturating_sub(w.window_ns);
            let oldest = ts.into_iter().find(|&t| t >= cutoff).unwrap_or(now);
            let expires = oldest.saturating_add(w.window_ns);
            return Err(ScoreError::RateLimited {
                window_label: w.label.to_string(),
                max: w.max,
                seconds_until_next: expires.saturating_sub(now) / 1_000_000_000,
            });
        }
    }
    rate.push(now);
    RATE_MAP.with(|r| {
        r.borrow_mut().insert(pkey.clone(), rate);
    });

    // Update per-(game, principal) run history.
    let gp_key = GamePrincipalKey {
        game,
        principal: pkey.clone(),
    };
    let mut hist = RUN_HISTORY_MAP.with(|m| m.borrow().get(&gp_key).unwrap_or_default());
    let prev_best = hist.best_score;
    hist.push(RunSlot {
        score: args.score,
        ts_ns: now,
        streak: args.streak,
        reserved: 0,
    });
    let new_personal_best = args.score > prev_best;
    RUN_HISTORY_MAP.with(|m| {
        m.borrow_mut().insert(gp_key.clone(), hist);
    });

    let slot = ScoreSlot {
        principal: pkey.clone(),
        score: args.score,
        ts_ns: now,
        streak: args.streak,
        reserved: 0,
    };

    // Insert into all-time bucket.
    let mut bucket = TOP_ALLTIME.with(|m| m.borrow().get(&game).unwrap_or_default());
    bucket.insert(slot, TOP_ALLTIME_K);
    let all_time_rank = rank_in(&bucket, &pkey, args.score, now);
    TOP_ALLTIME.with(|m| {
        m.borrow_mut().insert(game, bucket);
    });

    // Insert into today bucket (with day-stamp reset).
    let today = now / NS_PER_DAY;
    let stamp = TOP_TODAY_STAMP
        .with(|m| m.borrow().get(&game).map(|d| d.0))
        .unwrap_or(0);
    let mut today_bucket = if stamp == today {
        TOP_TODAY.with(|m| m.borrow().get(&game).unwrap_or_default())
    } else {
        TopBucket::default()
    };
    today_bucket.insert(slot, TOP_TODAY_K);
    let today_rank = rank_in(&today_bucket, &pkey, args.score, now);
    TOP_TODAY.with(|m| {
        m.borrow_mut().insert(game, today_bucket);
    });
    TOP_TODAY_STAMP.with(|m| {
        m.borrow_mut().insert(game, DayStamp(today));
    });

    Ok(SubmitOk {
        principal: caller,
        game: args.game,
        score: args.score,
        ts_ns: now,
        all_time_rank,
        today_rank,
        new_personal_best,
    })
}

fn rank_in(b: &TopBucket, pkey: &PrincipalKey, score: u64, ts: u64) -> Option<u32> {
    b.entries
        .iter()
        .position(|e| e.principal == *pkey && e.score == score && e.ts_ns == ts)
        .map(|i| (i as u32) + 1)
}

// ---- Read endpoints ----

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct ScoreEntry {
    pub principal: Principal,
    pub score: u64,
    pub ts_ns: u64,
    pub streak: u32,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum Period {
    AllTime,
    Today,
}

#[query]
fn top(game: String, period: Period, limit: u32) -> Vec<ScoreEntry> {
    let game_tag = match GameTag::from_str(&game) {
        Ok(g) => g,
        Err(_) => return Vec::new(),
    };
    let bucket = match period {
        Period::AllTime => TOP_ALLTIME.with(|m| m.borrow().get(&game_tag)).unwrap_or_default(),
        Period::Today => {
            let now = ic_cdk::api::time();
            let today = now / NS_PER_DAY;
            let stamp = TOP_TODAY_STAMP
                .with(|m| m.borrow().get(&game_tag).map(|d| d.0))
                .unwrap_or(0);
            if stamp != today {
                TopBucket::default()
            } else {
                TOP_TODAY.with(|m| m.borrow().get(&game_tag)).unwrap_or_default()
            }
        }
    };
    bucket
        .entries
        .into_iter()
        .take(limit as usize)
        .map(|e| ScoreEntry {
            principal: e.principal.to_principal(),
            score: e.score,
            ts_ns: e.ts_ns,
            streak: e.streak,
        })
        .collect()
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct PrincipalStats {
    pub game: String,
    pub principal: Principal,
    pub best_score: u64,
    pub total_runs: u64,
    pub avg_score: u64,
    pub last_ts_ns: u64,
    pub recent: Vec<ScoreEntry>, // chronological, oldest-first
}

#[query]
fn stats_for(game: String, principal: Principal) -> Option<PrincipalStats> {
    let game_tag = GameTag::from_str(&game).ok()?;
    let pkey = PrincipalKey::from_principal(&principal);
    let gp = GamePrincipalKey {
        game: game_tag.clone(),
        principal: pkey,
    };
    let h = RUN_HISTORY_MAP.with(|m| m.borrow().get(&gp))?;
    if h.total_runs == 0 {
        return None;
    }
    let avg = if h.total_runs == 0 {
        0
    } else {
        h.sum_scores / h.total_runs
    };
    let recent = h
        .iter_chronological()
        .into_iter()
        .map(|r| ScoreEntry {
            principal,
            score: r.score,
            ts_ns: r.ts_ns,
            streak: r.streak,
        })
        .collect();
    Some(PrincipalStats {
        game: game_tag.to_string(),
        principal,
        best_score: h.best_score,
        total_runs: h.total_runs,
        avg_score: avg,
        last_ts_ns: h.last_ts_ns,
        recent,
    })
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct GameOverview {
    pub game: String,
    pub all_time_count: u32,
    pub today_count: u32,
    pub top_alltime_score: u64,
    pub top_today_score: u64,
}

/// List every game tag that's seen at least one submission.
#[query]
fn games() -> Vec<GameOverview> {
    let now = ic_cdk::api::time();
    let today = now / NS_PER_DAY;
    let mut out: Vec<GameOverview> = Vec::new();
    TOP_ALLTIME.with(|m| {
        for (g, b) in m.borrow().iter() {
            let today_bucket = {
                let stamp = TOP_TODAY_STAMP
                    .with(|s| s.borrow().get(&g).map(|d| d.0))
                    .unwrap_or(0);
                if stamp == today {
                    TOP_TODAY.with(|t| t.borrow().get(&g)).unwrap_or_default()
                } else {
                    TopBucket::default()
                }
            };
            out.push(GameOverview {
                game: g.to_string(),
                all_time_count: b.entries.len() as u32,
                today_count: today_bucket.entries.len() as u32,
                top_alltime_score: b.entries.first().map(|e| e.score).unwrap_or(0),
                top_today_score: today_bucket.entries.first().map(|e| e.score).unwrap_or(0),
            });
        }
    });
    out
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct RateLimitView {
    pub label: String,
    pub max: u32,
    pub window_seconds: u64,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct ConfigView {
    pub top_alltime_k: u32,
    pub top_today_k: u32,
    pub run_history_depth: u32,
    pub max_game_tag_chars: u32,
    pub rate_limits: Vec<RateLimitView>,
    pub related_ledger: Option<Principal>,
}

#[query]
fn config() -> ConfigView {
    ConfigView {
        top_alltime_k: TOP_ALLTIME_K as u32,
        top_today_k: TOP_TODAY_K as u32,
        run_history_depth: RUN_HISTORY_DEPTH as u32,
        max_game_tag_chars: GAME_TAG_MAX as u32,
        rate_limits: SUBMIT_LIMITS
            .iter()
            .map(|w| RateLimitView {
                label: w.label.to_string(),
                max: w.max,
                window_seconds: w.window_ns / 1_000_000_000,
            })
            .collect(),
        related_ledger: CONFIG.with(|c| c.borrow().get().related_ledger),
    }
}

#[query]
fn version() -> String {
    "game_scores-0.1.0".to_string()
}

#[query]
fn canister_principal() -> Principal {
    ic_cdk::api::id()
}

// Silence dead_code on Nat — not used yet but re-exported via candid.
#[allow(dead_code)]
fn _nat_compat(n: u64) -> Nat {
    Nat::from(n)
}

ic_cdk::export_candid!();
