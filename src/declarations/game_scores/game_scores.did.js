export const idlFactory = ({ IDL }) => {
  const InitArgs = IDL.Record({ 'related_ledger' : IDL.Opt(IDL.Principal) });
  const RateLimitView = IDL.Record({
    'max' : IDL.Nat32,
    'label' : IDL.Text,
    'window_seconds' : IDL.Nat64,
  });
  const ConfigView = IDL.Record({
    'max_game_tag_chars' : IDL.Nat32,
    'top_today_k' : IDL.Nat32,
    'run_history_depth' : IDL.Nat32,
    'related_ledger' : IDL.Opt(IDL.Principal),
    'top_alltime_k' : IDL.Nat32,
    'rate_limits' : IDL.Vec(RateLimitView),
  });
  const GameOverview = IDL.Record({
    'game' : IDL.Text,
    'all_time_count' : IDL.Nat32,
    'top_alltime_score' : IDL.Nat64,
    'today_count' : IDL.Nat32,
    'top_today_score' : IDL.Nat64,
  });
  const ScoreEntry = IDL.Record({
    'streak' : IDL.Nat32,
    'principal' : IDL.Principal,
    'ts_ns' : IDL.Nat64,
    'score' : IDL.Nat64,
  });
  const PrincipalStats = IDL.Record({
    'principal' : IDL.Principal,
    'game' : IDL.Text,
    'total_runs' : IDL.Nat64,
    'avg_score' : IDL.Nat64,
    'last_ts_ns' : IDL.Nat64,
    'best_score' : IDL.Nat64,
    'recent' : IDL.Vec(ScoreEntry),
  });
  const SubmitArgs = IDL.Record({
    'streak' : IDL.Nat32,
    'game' : IDL.Text,
    'score' : IDL.Nat64,
  });
  const SubmitOk = IDL.Record({
    'all_time_rank' : IDL.Opt(IDL.Nat32),
    'today_rank' : IDL.Opt(IDL.Nat32),
    'principal' : IDL.Principal,
    'ts_ns' : IDL.Nat64,
    'game' : IDL.Text,
    'score' : IDL.Nat64,
    'new_personal_best' : IDL.Bool,
  });
  const ScoreError = IDL.Variant({
    'GameTagTooLong' : IDL.Record({ 'max' : IDL.Nat32 }),
    'ScoreZero' : IDL.Null,
    'GameTagInvalidChar' : IDL.Null,
    'RateLimited' : IDL.Record({
      'max' : IDL.Nat32,
      'seconds_until_next' : IDL.Nat64,
      'window_label' : IDL.Text,
    }),
    'GameTagEmpty' : IDL.Null,
    'AnonymousCaller' : IDL.Null,
  });
  const Period = IDL.Variant({ 'AllTime' : IDL.Null, 'Today' : IDL.Null });
  return IDL.Service({
    'canister_principal' : IDL.Func([], [IDL.Principal], ['query']),
    'config' : IDL.Func([], [ConfigView], ['query']),
    'games' : IDL.Func([], [IDL.Vec(GameOverview)], ['query']),
    'stats_for' : IDL.Func(
        [IDL.Text, IDL.Principal],
        [IDL.Opt(PrincipalStats)],
        ['query'],
      ),
    'submit_score' : IDL.Func(
        [SubmitArgs],
        [IDL.Variant({ 'Ok' : SubmitOk, 'Err' : ScoreError })],
        [],
      ),
    'top' : IDL.Func(
        [IDL.Text, Period, IDL.Nat32],
        [IDL.Vec(ScoreEntry)],
        ['query'],
      ),
    'version' : IDL.Func([], [IDL.Text], ['query']),
  });
};
export const init = ({ IDL }) => {
  const InitArgs = IDL.Record({ 'related_ledger' : IDL.Opt(IDL.Principal) });
  return [InitArgs];
};
