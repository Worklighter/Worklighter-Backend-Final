
//* -------------------------------------------------------------------------- */
//*                        CREW HOURS CALCULATOR                               */
//* -------------------------------------------------------------------------- */
//* Pure deterministic utility — no LLM involvement.
//*
//* The LLM extracts rawHours exactly as printed in the document (e.g. "8",
//* "7.5", "8:00 to 15:38", "7:45AM - 2:57PM").  This module parses every
//* known format and converts it to a decimal hour value, then sums the crew.
//*
//* Supported rawHours formats:
//*   • Decimal / integer    "8"  "7.5"  "10"
//*   • Time range (24h)     "8:00 to 15:38"   "08:00-16:00"
//*   • Time range (12h)     "7:45AM - 2:57PM" "6:15 to 13:19"
//*   • Already-decimal      "7.63" (pre-calculated by the document)

export interface ICrewMember {
    name: string;
    trade: string;
    rawHours: string;
}

export interface ICrewHoursResult {
    crew: ICrewMember[];
    totalCrewHours: number;
}

//* Converts a time string like "8:00", "7:45AM", "15:38", "2:57PM"
//* to decimal hours since midnight.
function timeToDecimalHours(raw: string): number | null {
    const cleaned = raw.trim().toUpperCase();

    const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const meridiem = match[3] ?? null;

    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;

    return hours + minutes / 60;
}

//* Parses a single rawHours string and returns decimal hours, or null if unparseable.
export function parseRawHours(raw: string | null | undefined): number | null {
    if (!raw || raw.trim() === '') return null;

    const trimmed = raw.trim();

    //* Plain decimal or integer: "8", "7.5", "10", "43.6"
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return parseFloat(trimmed);
    }

    //* Time range: "8:00 to 15:38", "7:45AM - 2:57PM", "08:00-16:00", "6:15 to 13:19"
    //* Separator: " to ", " - ", "-" (with optional spaces)
    const rangeSeparator = /\s+to\s+|\s*[-–]\s*/i;
    const parts = trimmed.split(rangeSeparator);

    if (parts.length === 2) {
        const start = timeToDecimalHours(parts[0]);
        const end = timeToDecimalHours(parts[1]);

        if (start !== null && end !== null) {
            //* Handle crossing midnight (rare but possible)
            const duration = end >= start ? end - start : 24 - start + end;
            return Math.round(duration * 100) / 100;
        }
    }

    return null;
}

//* Computes the total crew hours from an array of crew members.
//* Skips any member whose rawHours cannot be parsed (e.g. "N/A", missing).
//* Returns totalCrewHours rounded to 2 decimal places.
export function calculateCrewHours(crew: ICrewMember[]): ICrewHoursResult {
    let total = 0;

    for (const member of crew) {
        const parsed = parseRawHours(member.rawHours);
        if (parsed !== null) {
            total += parsed;
        }
    }

    return {
        crew,
        totalCrewHours: Math.round(total * 100) / 100,
    };
}
