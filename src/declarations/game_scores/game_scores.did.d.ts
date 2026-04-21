import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface ConfigView {
  'max_game_tag_chars' : number,
  'top_today_k' : number,
  'run_history_depth' : number,
  'related_ledger' : [] | [Principal],
  'top_alltime_k' : number,
  'rate_limits' : Array<RateLimitView>,
}
export interface GameOverview {
  'game' : string,
  'all_time_count' : number,
  'top_alltime_score' : bigint,
  'today_count' : number,
  'top_today_score' : bigint,
}
/**
 * Multi-game scoreboard canister candid interface.
 */
export interface InitArgs { 'related_ledger' : [] | [Principal] }
export type Period = { 'AllTime' : null } |
  { 'Today' : null };
export interface PrincipalStats {
  'principal' : Principal,
  'game' : string,
  'total_runs' : bigint,
  'avg_score' : bigint,
  'last_ts_ns' : bigint,
  'best_score' : bigint,
  'recent' : Array<ScoreEntry>,
}
export interface RateLimitView {
  'max' : number,
  'label' : string,
  'window_seconds' : bigint,
}
export interface ScoreEntry {
  'streak' : number,
  'principal' : Principal,
  'ts_ns' : bigint,
  'score' : bigint,
}
export type ScoreError = { 'GameTagTooLong' : { 'max' : number } } |
  { 'ScoreZero' : null } |
  { 'GameTagInvalidChar' : null } |
  {
    'RateLimited' : {
      'max' : number,
      'seconds_until_next' : bigint,
      'window_label' : string,
    }
  } |
  { 'GameTagEmpty' : null } |
  { 'AnonymousCaller' : null };
export interface SubmitArgs {
  'streak' : number,
  'game' : string,
  'score' : bigint,
}
export interface SubmitOk {
  'all_time_rank' : [] | [number],
  'today_rank' : [] | [number],
  'principal' : Principal,
  'ts_ns' : bigint,
  'game' : string,
  'score' : bigint,
  'new_personal_best' : boolean,
}
export interface _SERVICE {
  'canister_principal' : ActorMethod<[], Principal>,
  'config' : ActorMethod<[], ConfigView>,
  'games' : ActorMethod<[], Array<GameOverview>>,
  'stats_for' : ActorMethod<[string, Principal], [] | [PrincipalStats]>,
  'submit_score' : ActorMethod<
    [SubmitArgs],
    { 'Ok' : SubmitOk } |
      { 'Err' : ScoreError }
  >,
  'top' : ActorMethod<[string, Period, number], Array<ScoreEntry>>,
  'version' : ActorMethod<[], string>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
