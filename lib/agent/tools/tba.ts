import { z } from "zod";
import { tool } from "ai";
import {
  getTBAClient,
  formatTeamKey,
  formatMatchKey,
  type TBAMatch,
  type TBARanking,
} from "@/lib/tba/client";

/**
 * Format a match result for display
 */
function formatMatchResult(match: TBAMatch, compact = false): string {
  const red = match.alliances.red;
  const blue = match.alliances.blue;
  const redTeams = red.team_keys.map(formatTeamKey).join(", ");
  const blueTeams = blue.team_keys.map(formatTeamKey).join(", ");

  if (compact) {
    const result = red.score >= 0 ? `${red.score}-${blue.score}` : "TBD";
    return `${formatMatchKey(match)}: 🔴[${redTeams}] vs 🔵[${blueTeams}] → ${result}`;
  }

  const winner =
    match.winning_alliance === "red"
      ? "🔴 RED wins"
      : match.winning_alliance === "blue"
        ? "🔵 BLUE wins"
        : red.score >= 0 ? "TIE" : "";

  const time = match.actual_time
    ? new Date(match.actual_time * 1000).toLocaleString()
    : match.time
      ? new Date(match.time * 1000).toLocaleString()
      : "TBD";

  return `${formatMatchKey(match)}
  🔴 Red: [${redTeams}] - ${red.score >= 0 ? red.score : "—"}
  🔵 Blue: [${blueTeams}] - ${blue.score >= 0 ? blue.score : "—"}
  ${red.score >= 0 ? winner : `Scheduled: ${time}`}`;
}

/**
 * Sort matches by comp level and match number
 */
function sortMatches(matches: TBAMatch[]): TBAMatch[] {
  const levelOrder = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
  return [...matches].sort((a, b) => {
    const levelDiff = levelOrder[a.comp_level] - levelOrder[b.comp_level];
    if (levelDiff !== 0) return levelDiff;
    if (a.set_number !== b.set_number) return a.set_number - b.set_number;
    return a.match_number - b.match_number;
  });
}

/**
 * Calculate win/loss record for a team from matches
 */
function calculateRecord(matches: TBAMatch[], teamKey: string): string {
  let wins = 0, losses = 0, ties = 0;
  for (const match of matches) {
    if (match.alliances.red.score < 0) continue;
    const isRed = match.alliances.red.team_keys.includes(teamKey);
    const teamAlliance = isRed ? "red" : "blue";
    if (match.winning_alliance === "") ties++;
    else if (match.winning_alliance === teamAlliance) wins++;
    else losses++;
  }
  if (wins + losses + ties === 0) return "";
  return `${wins}-${losses}${ties > 0 ? `-${ties}` : ""}`;
}

export const tbaTool = tool({
  description: `Query The Blue Alliance for FRC competition data.

Query types:
- "team": Get team info and their events (params: team, year?)
- "team_event": Get team's matches & status at an event (params: team, event)
- "event": Get event info, rankings, and teams (params: event)
- "stats": Get OPR/DPR stats for an event (params: event)
- "district": Get district rankings (params: district like "2025pch")

Examples:
- Team info: query="team", team=254
- Team schedule: query="team", team=1414, year=2025
- Match results: query="team_event", team=1414, event="2025gaalb"
- Event rankings: query="event", event="2025gaalb"
- OPR stats: query="stats", event="2025gaalb"
- District standings: query="district", district="2025pch"`,

  inputSchema: z.object({
    query: z.enum(["team", "team_event", "event", "stats", "district"]),
    team: z.union([z.string(), z.number()]).optional().describe("Team number"),
    event: z.string().optional().describe("Event key (e.g., 2025gaalb)"),
    district: z.string().optional().describe("District key (e.g., 2025pch)"),
    year: z.number().optional().describe("Year (defaults to current)"),
    limit: z.number().optional().describe("Max results"),
  }),

  execute: async ({ query, team, event, district, year, limit }) => {
    const client = getTBAClient();
    const currentYear = new Date().getFullYear();
    const targetYear = year || currentYear;

    try {
      switch (query) {
        // ==================== TEAM ====================
        case "team": {
          if (!team) return "Error: team parameter required";
          
          const [teamData, events, awards] = await Promise.all([
            client.getTeam(team),
            client.getTeamEvents(team, targetYear),
            client.getTeamAwards(team, targetYear).catch(() => []),
          ]);

          // Sort events by date
          events.sort((a, b) => 
            new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
          );

          let result = `*Team ${teamData.team_number}: ${teamData.nickname}*
${teamData.city}, ${teamData.state_prov}, ${teamData.country} | Rookie: ${teamData.rookie_year}`;

          if (teamData.website) result += `\nWebsite: ${teamData.website}`;

          if (events.length > 0) {
            result += `\n\n*${targetYear} Events:*\n`;
            result += events
              .map((e) => `• ${e.name} (${e.key}) - ${e.start_date}`)
              .join("\n");
          } else {
            result += `\n\nNo events registered for ${targetYear}.`;
          }

          if (awards.length > 0) {
            result += `\n\n*${targetYear} Awards:*\n`;
            result += awards.map((a) => `• ${a.name}`).join("\n");
          }

          return result;
        }

        // ==================== TEAM AT EVENT ====================
        case "team_event": {
          if (!team) return "Error: team parameter required";
          if (!event) return "Error: event parameter required";

          const teamKey = client.normalizeTeamKey(team);
          const [matches, status, eventData] = await Promise.all([
            client.getTeamEventMatches(team, event),
            client.getTeamEventStatus(team, event).catch(() => null),
            client.getEvent(event),
          ]);

          let result = `*Team ${formatTeamKey(teamKey)} at ${eventData.name}*\n`;

          // Status/ranking
          if (status?.qual?.ranking) {
            const r = status.qual.ranking;
            result += `Rank: #${r.rank} of ${status.qual.num_teams} | Record: ${r.record.wins}-${r.record.losses}-${r.record.ties}\n`;
          }
          if (status?.alliance) {
            const pick = status.alliance.pick === 0 ? "Captain" : `Pick ${status.alliance.pick}`;
            result += `Alliance: ${status.alliance.name} (${pick})\n`;
          }
          if (status?.playoff) {
            result += `Playoffs: ${status.playoff.level} - ${status.playoff.status}\n`;
          }

          // Matches
          if (matches.length > 0) {
            const sorted = sortMatches(matches);
            const record = calculateRecord(matches, teamKey);
            const displayLimit = limit || 8;
            const display = sorted.slice(0, displayLimit);
            
            result += `\n*Matches${record ? ` (${record})` : ""}:*\n`;
            result += display.map((m) => formatMatchResult(m, true)).join("\n");
            
            if (sorted.length > displayLimit) {
              result += `\n... and ${sorted.length - displayLimit} more`;
            }
          } else {
            result += "\nNo matches yet.";
          }

          return result;
        }

        // ==================== EVENT ====================
        case "event": {
          if (!event) return "Error: event parameter required";

          const [eventData, rankings, teams] = await Promise.all([
            client.getEvent(event),
            client.getEventRankings(event).catch(() => null),
            client.getEventTeams(event),
          ]);

          let result = `*${eventData.name}*
${eventData.event_type_string} | ${eventData.city}, ${eventData.state_prov}
${eventData.start_date} to ${eventData.end_date}${eventData.week !== undefined ? ` (Week ${eventData.week})` : ""}
${teams.length} teams competing`;

          if (rankings?.rankings && rankings.rankings.length > 0) {
            const displayLimit = limit || 10;
            const display = rankings.rankings.slice(0, displayLimit);
            
            result += `\n\n*Rankings:*\n`;
            result += display
              .map((r: TBARanking) => 
                `${r.rank}. Team ${formatTeamKey(r.team_key)} (${r.record.wins}-${r.record.losses}-${r.record.ties})`
              )
              .join("\n");
            
            if (rankings.rankings.length > displayLimit) {
              result += `\n... and ${rankings.rankings.length - displayLimit} more`;
            }
          }

          return result;
        }

        // ==================== STATS ====================
        case "stats": {
          if (!event) return "Error: event parameter required";

          const [stats, eventData] = await Promise.all([
            client.getEventOPRs(event),
            client.getEvent(event),
          ]);

          if (!stats.oprs || Object.keys(stats.oprs).length === 0) {
            return `No OPR stats for ${eventData.name} yet. Stats are calculated after matches.`;
          }

          const teamStats = Object.keys(stats.oprs)
            .map((key) => ({
              team: formatTeamKey(key),
              opr: stats.oprs[key],
              dpr: stats.dprs[key],
              ccwm: stats.ccwms[key],
            }))
            .sort((a, b) => b.opr - a.opr);

          const displayLimit = limit || 10;
          const display = teamStats.slice(0, displayLimit);

          let result = `*OPR Stats for ${eventData.name}*
(OPR=offense, DPR=defense, CCWM=margin)\n\n`;
          
          result += display
            .map((t, i) => 
              `${i + 1}. Team ${t.team}: OPR ${t.opr.toFixed(1)} | DPR ${t.dpr.toFixed(1)} | CCWM ${t.ccwm.toFixed(1)}`
            )
            .join("\n");

          if (teamStats.length > displayLimit) {
            result += `\n... and ${teamStats.length - displayLimit} more`;
          }

          return result;
        }

        // ==================== DISTRICT ====================
        case "district": {
          if (!district) return "Error: district parameter required (e.g., 2025pch)";

          const rankings = await client.getDistrictRankings(district);
          
          if (rankings.length === 0) {
            return `No rankings for district ${district} yet.`;
          }

          const displayLimit = limit || 15;
          const display = rankings.slice(0, displayLimit);

          let result = `*District Rankings: ${district.toUpperCase()}*
${rankings.length} teams\n\n`;
          
          result += display
            .map((r) => `${r.rank}. Team ${formatTeamKey(r.team_key)} - ${r.point_total} pts`)
            .join("\n");

          if (rankings.length > displayLimit) {
            result += `\n... and ${rankings.length - displayLimit} more`;
          }

          return result;
        }

        default:
          return `Unknown query: ${query}`;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Not found")) {
        return `Not found. Check that the team/event/district key is correct.`;
      }
      throw error;
    }
  },
});

export const tbaTools = {
  tba: tbaTool,
};
