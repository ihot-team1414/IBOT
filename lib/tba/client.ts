/**
 * The Blue Alliance API Client
 * API Docs: https://www.thebluealliance.com/apidocs/v3
 */

const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

// Type definitions for TBA API responses
export interface TBATeam {
  key: string; // e.g., "frc1414"
  team_number: number;
  nickname: string;
  name: string; // Full official name
  city: string;
  state_prov: string;
  country: string;
  rookie_year: number;
  website?: string;
  motto?: string;
}

export interface TBAEvent {
  key: string; // e.g., "2025gaalb"
  name: string;
  event_code: string;
  event_type: number;
  event_type_string: string;
  city: string;
  state_prov: string;
  country: string;
  start_date: string;
  end_date: string;
  year: number;
  week?: number;
  address?: string;
  location_name?: string;
  website?: string;
  playoff_type?: number;
  playoff_type_string?: string;
}

export interface TBAMatch {
  key: string; // e.g., "2025gaalb_qm1"
  comp_level: "qm" | "ef" | "qf" | "sf" | "f";
  set_number: number;
  match_number: number;
  alliances: {
    red: TBAAlliance;
    blue: TBAAlliance;
  };
  winning_alliance: "red" | "blue" | "";
  event_key: string;
  time?: number; // Unix timestamp
  actual_time?: number;
  predicted_time?: number;
  post_result_time?: number;
  score_breakdown?: Record<string, unknown>;
}

export interface TBAAlliance {
  team_keys: string[];
  score: number;
  surrogate_team_keys?: string[];
  dq_team_keys?: string[];
}

export interface TBARanking {
  rank: number;
  team_key: string;
  record: {
    wins: number;
    losses: number;
    ties: number;
  };
  qual_average?: number;
  matches_played: number;
  dq: number;
  sort_orders: number[];
}

export interface TBARankings {
  rankings: TBARanking[];
  sort_order_info: Array<{
    name: string;
    precision: number;
  }>;
}

export interface TBAEventOPRs {
  oprs: Record<string, number>;
  dprs: Record<string, number>;
  ccwms: Record<string, number>;
}

export interface TBAAward {
  name: string;
  award_type: number;
  event_key: string;
  recipient_list: Array<{
    team_key: string | null;
    awardee: string | null;
  }>;
  year: number;
}

export interface TBATeamEventStatus {
  qual?: {
    ranking: TBARanking;
    num_teams: number;
    status: string;
  };
  alliance?: {
    name: string;
    number: number;
    pick: number;
  };
  playoff?: {
    level: string;
    status: string;
    record: {
      wins: number;
      losses: number;
      ties: number;
    };
  };
  overall_status_str: string;
}

class TBAClient {
  private apiKey: string;

  constructor() {
    const key = process.env.TBA_API_KEY;
    if (!key) {
      throw new Error("TBA_API_KEY environment variable is not set");
    }
    this.apiKey = key;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${TBA_BASE_URL}${endpoint}`, {
      headers: {
        "X-TBA-Auth-Key": this.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Not found: ${endpoint}`);
      }
      throw new Error(`TBA API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Normalize team input to TBA team key format (frc####)
   */
  normalizeTeamKey(input: string | number): string {
    const str = String(input).toLowerCase().trim();
    if (str.startsWith("frc")) {
      return str;
    }
    // Extract just the number
    const num = str.replace(/\D/g, "");
    return `frc${num}`;
  }

  /**
   * Get basic info about a team
   */
  async getTeam(teamKey: string | number): Promise<TBATeam> {
    const key = this.normalizeTeamKey(teamKey);
    return this.fetch<TBATeam>(`/team/${key}`);
  }

  /**
   * Get events a team is registered for in a given year
   */
  async getTeamEvents(teamKey: string | number, year: number): Promise<TBAEvent[]> {
    const key = this.normalizeTeamKey(teamKey);
    return this.fetch<TBAEvent[]>(`/team/${key}/events/${year}`);
  }

  /**
   * Get all matches for a team at a specific event
   */
  async getTeamEventMatches(
    teamKey: string | number,
    eventKey: string
  ): Promise<TBAMatch[]> {
    const key = this.normalizeTeamKey(teamKey);
    return this.fetch<TBAMatch[]>(`/team/${key}/event/${eventKey}/matches`);
  }

  /**
   * Get a team's status at an event (ranking, alliance, playoff status)
   */
  async getTeamEventStatus(
    teamKey: string | number,
    eventKey: string
  ): Promise<TBATeamEventStatus> {
    const key = this.normalizeTeamKey(teamKey);
    return this.fetch<TBATeamEventStatus>(`/team/${key}/event/${eventKey}/status`);
  }

  /**
   * Get awards a team received in a given year
   */
  async getTeamAwards(teamKey: string | number, year: number): Promise<TBAAward[]> {
    const key = this.normalizeTeamKey(teamKey);
    return this.fetch<TBAAward[]>(`/team/${key}/awards/${year}`);
  }

  /**
   * Get event details
   */
  async getEvent(eventKey: string): Promise<TBAEvent> {
    return this.fetch<TBAEvent>(`/event/${eventKey}`);
  }

  /**
   * Get all teams at an event
   */
  async getEventTeams(eventKey: string): Promise<TBATeam[]> {
    return this.fetch<TBATeam[]>(`/event/${eventKey}/teams`);
  }

  /**
   * Get event rankings
   */
  async getEventRankings(eventKey: string): Promise<TBARankings> {
    return this.fetch<TBARankings>(`/event/${eventKey}/rankings`);
  }

  /**
   * Get all matches at an event
   */
  async getEventMatches(eventKey: string): Promise<TBAMatch[]> {
    return this.fetch<TBAMatch[]>(`/event/${eventKey}/matches`);
  }

  /**
   * Get OPR/DPR/CCWM stats for an event
   */
  async getEventOPRs(eventKey: string): Promise<TBAEventOPRs> {
    return this.fetch<TBAEventOPRs>(`/event/${eventKey}/oprs`);
  }

  /**
   * Get a specific match
   */
  async getMatch(matchKey: string): Promise<TBAMatch> {
    return this.fetch<TBAMatch>(`/match/${matchKey}`);
  }

  /**
   * Get all events for a year (optionally filtered by week)
   */
  async getEvents(year: number, week?: number): Promise<TBAEvent[]> {
    const events = await this.fetch<TBAEvent[]>(`/events/${year}`);
    if (week !== undefined) {
      return events.filter((e) => e.week === week);
    }
    return events;
  }

  /**
   * Search for events by district (e.g., "pch" for Peachtree)
   */
  async getDistrictEvents(districtKey: string): Promise<TBAEvent[]> {
    return this.fetch<TBAEvent[]>(`/district/${districtKey}/events`);
  }

  /**
   * Get district rankings
   */
  async getDistrictRankings(
    districtKey: string
  ): Promise<Array<{ team_key: string; rank: number; point_total: number }>> {
    return this.fetch<Array<{ team_key: string; rank: number; point_total: number }>>(
      `/district/${districtKey}/rankings`
    );
  }
}

// Singleton instance
let client: TBAClient | null = null;

export function getTBAClient(): TBAClient {
  if (!client) {
    client = new TBAClient();
  }
  return client;
}

// Helper functions for formatting
export function formatTeamKey(key: string): string {
  // "frc1414" -> "1414"
  return key.replace("frc", "");
}

export function formatCompLevel(level: string): string {
  const levels: Record<string, string> = {
    qm: "Quals",
    ef: "Eighths",
    qf: "Quarters",
    sf: "Semis",
    f: "Finals",
  };
  return levels[level] || level;
}

export function formatMatchKey(match: TBAMatch): string {
  const level = formatCompLevel(match.comp_level);
  if (match.comp_level === "qm") {
    return `${level} ${match.match_number}`;
  }
  return `${level} ${match.set_number}-${match.match_number}`;
}
