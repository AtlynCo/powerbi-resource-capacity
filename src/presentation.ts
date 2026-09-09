import { CapacityModel, State } from "./model";

export const markers: Record<State, string> = {
  available: "+", full: "=", overload: "!", nonworking: "N", unavailable: "/", missing: "?", invalid: "X", duplicate: "D", absent: "?"
};
export const legendStates: State[] = ["overload", "available", "full", "nonworking", "unavailable", "missing", "invalid", "duplicate"];

export function summarize<T>(model: CapacityModel<T>): { overloads: number; unknown: number; valid: number } {
  let overloads = 0, unknown = model.resources.length * model.periods.length - model.cells.size, valid = 0;
  for (const cell of model.cells.values()) {
    if (cell.state === "missing" || cell.state === "invalid" || cell.state === "duplicate") unknown++;
    else valid++;
    if (cell.state === "overload") overloads++;
  }
  return { overloads, unknown, valid };
}
