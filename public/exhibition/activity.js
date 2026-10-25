import { actors, cycle } from "./world-data.js";
export const STEP_MS = 1400;
const background = {
  manager: "think",
  architect: "think",
  engineer: "work",
  designer: "work",
  learning: "learn",
  security: "verify",
  reliability: "work",
  cost: "think",
  customer: "work",
  assistant: "collaborate",
};
export function activityAt(ms) {
  return Object.fromEntries(
    actors.map((a, i) => {
      const events = cycle.filter(
          (e) => e.actor === a.id && (e.step - 1) * STEP_MS <= ms,
        ),
        e = events.at(-1),
        age = e ? ms - (e.step - 1) * STEP_MS : Infinity;
      const foreground = e && age < STEP_MS * 3;
      // A scheduled four-person reporting cohort overlaps in front of the Root hub.
      const cohort = Math.floor(ms / 9800) % 3;
      const group = [
        ["architect", "engineer", "designer", "reliability"],
        ["security", "cost", "customer", "learning"],
        ["assistant", "engineer", "architect", "customer"],
      ][cohort];
      const position = group.indexOf(a.id),
        phase = ((ms % 9800) - position * 290) / 7600;
      const reporting = position >= 0 && phase >= 0 && phase < 1;
      return [
        a.id,
        {
          state: reporting ? "report" : foreground ? e.state : background[a.id],
          progress: reporting
            ? phase
            : foreground
              ? Math.min(0.999, age / (STEP_MS * 3))
              : (ms % 5600) / 5600,
          title: reporting
            ? "Report to Root / " + a.role
            : foreground
              ? e.title
              : "Ongoing / " + a.role,
          detail: reporting
            ? "Bring the scoped findings to Root Manager; confer, then return to the workstation."
            : foreground
              ? e.detail
              : a.goal,
          source: "SIMULATED",
        },
      ];
    }),
  );
}
