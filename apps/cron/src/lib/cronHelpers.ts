import CronParser from "cron-parser";
import cronstrue from "cronstrue";

export type CronMode = "standard" | "ncron";

export interface CronInfo {
  expression: string;
  description: string;
  nextRun: Date | null;
  next5Runs: Date[];
  isValid: boolean;
  error?: string;
}

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

const prepareExpression = (expression: string, mode: CronMode) => {
  const normalized = normalizeWhitespace(expression);
  const parts = normalized.length ? normalized.split(" ") : [];

  if (mode === "standard") {
    if (parts.length === 6) {
      parts.shift();
    }
    if (parts.length !== 5) {
      throw new Error(`Standard cron expects 5 fields, received ${parts.length || 0}`);
    }
    return {
      expression: parts.join(" "),
      display: parts.join(" "),
      options: { currentDate: new Date() },
    } as const;
  }

  if (parts.length === 5) {
    parts.unshift("0");
  }
  if (parts.length !== 6) {
    throw new Error(`NCron expects 6 fields (seconds first), received ${parts.length || 0}`);
  }

  const withSeconds = parts.join(" ");
  return {
    expression: withSeconds,
    display: withSeconds,
    options: { currentDate: new Date() },
  } as const;
};

/**
 * Parse and analyze a cron expression
 */
export function parseCronExpression(expression: string, mode: CronMode): CronInfo {
  try {
    const { expression: prepared, display, options } = prepareExpression(expression, mode);
    const interval = CronParser.parse(prepared, options as any);

    const next5Runs: Date[] = [];
    const tempInterval = CronParser.parse(prepared, options as any);
    for (let i = 0; i < 5; i++) {
      next5Runs.push(tempInterval.next().toDate());
    }

    const description = cronstrue.toString(prepared, {
      throwExceptionOnParseError: false,
      verbose: true,
      use24HourTimeFormat: true,
      locale: "en",
    });

    return {
      expression: display,
      description,
      nextRun: interval.next().toDate(),
      next5Runs,
      isValid: true,
    };
  } catch (error) {
    return {
      expression,
      description: "Invalid cron expression",
      nextRun: null,
      next5Runs: [],
      isValid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Validate a cron expression
 */
export function validateCron(expression: string, mode: CronMode): { valid: boolean; error?: string } {
  try {
    const { expression: prepared, options } = prepareExpression(expression, mode);
    CronParser.parse(prepared, options as any);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Common cron expression examples
 */
export const CRON_EXAMPLES = [
  { expression: "* * * * *", description: "Every minute" },
  { expression: "0 * * * *", description: "Every hour" },
  { expression: "0 0 * * *", description: "Every day at midnight" },
  { expression: "0 0 * * 0", description: "Every Sunday at midnight" },
  { expression: "0 0 1 * *", description: "First day of every month at midnight" },
  { expression: "*/5 * * * *", description: "Every 5 minutes" },
  { expression: "0 */2 * * *", description: "Every 2 hours" },
  { expression: "0 9-17 * * 1-5", description: "Every hour from 9 AM to 5 PM on weekdays" },
  { expression: "0 0 * * 1,3,5", description: "Monday, Wednesday, Friday at midnight" },
  { expression: "0 0 1,15 * *", description: "1st and 15th of every month at midnight" },
  { expression: "0 2 * * *", description: "Every day at 2 AM" },
  { expression: "30 3 * * 6", description: "Every Saturday at 3:30 AM" },
  { expression: "0 0 * * *", description: "Daily at midnight (00:00)" },
  { expression: "0 12 * * *", description: "Daily at noon (12:00)" },
  { expression: "*/15 * * * *", description: "Every 15 minutes" },
  { expression: "0 0 1 1 *", description: "Every January 1st at midnight (New Year)" },
  { expression: "5 * * * *", description: "At minute 5 past every hour" },
  { expression: "0 9 * * MON-FRI", description: "Weekdays at 9:00 AM" },
  { expression: "30 21 * * MON", description: "Every Monday at 9:30 PM" },
  { expression: "0 12 1 */2 *", description: "Noon on the first day of every other month" },
];

export const NCRON_EXAMPLES = [
  { expression: "0 * * * * *", description: "Every minute (with seconds field)" },
  { expression: "30 */10 * * * *", description: "Every 10 minutes at 30 seconds past the minute" },
  { expression: "0 0 9-17 * * MON-FRI", description: "Start of each hour 9-17 on weekdays (with seconds)" },
  { expression: "15 30 8 * * *", description: "08:30:15 every day" },
  { expression: "0 0/5 9-17 * * MON-FRI", description: "Every 5 minutes during business hours (seconds inclusive)" },
];

/**
 * Get field descriptions for cron format
 */
export const CRON_FIELD_DESCRIPTIONS = [
  { field: "Seconds (NCron)", range: "0-59", wildcards: "* , - /" },
  { field: "Minute", range: "0-59", wildcards: "* , - /" },
  { field: "Hour", range: "0-23", wildcards: "* , - /" },
  { field: "Day of Month", range: "1-31", wildcards: "* , - / L W" },
  { field: "Month", range: "1-12 or JAN-DEC", wildcards: "* , - /" },
  { field: "Day of Week", range: "0-6 or SUN-SAT", wildcards: "* , - / L #" },
];

/**
 * Special characters explanation
 */
export const CRON_SPECIAL_CHARS = [
  { char: "*", meaning: "Any value" },
  { char: ",", meaning: "Value list separator" },
  { char: "-", meaning: "Range of values" },
  { char: "/", meaning: "Step values" },
  { char: "L", meaning: "Last (day of month or week)" },
  { char: "W", meaning: "Weekday nearest to given day" },
  { char: "#", meaning: "Nth occurrence of weekday in month" },
];
