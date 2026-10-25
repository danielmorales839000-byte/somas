// Synthetic choreography, deliberately separate from inconsistent source task/claim joins.
export const FLOW_COUNT = 48;
export const flowKinds = [
  { id: "instruction", name: "Instruction", color: "#4385e0" },
  { id: "report", name: "Report", color: "#19a59a" },
  { id: "verification", name: "Verification request", color: "#9570d0" },
  { id: "receipt", name: "Example receipt", color: "#deaa60" },
];
export function trafficAt(ms, ids, count = FLOW_COUNT) {
  if (!ids.length) return [];
  return Array.from({ length: count }, (_, slot) => {
    const duration = 4600 + (slot % 7) * 530,
      clock = ms + slot * 257,
      epoch = Math.floor(clock / duration),
      progress = (clock % duration) / duration;
    let from = ids[(slot * 7 + epoch * 3) % ids.length],
      to = ids[(slot * 11 + epoch * 5 + 1) % ids.length];
    if (from === to) to = ids[(ids.indexOf(from) + 1) % ids.length];
    if (slot % 6 === 0) from = "root";
    else if (slot % 6 === 1) to = "root";
    if (from === to) to = from === "root" ? ids[0] : "root";
    const kind = flowKinds[slot % flowKinds.length];
    return {
      slot,
      id: `SIM-FLOW-${String(slot + 1).padStart(2, "0")}-${epoch}`,
      from,
      to,
      kind: kind.id,
      label: kind.name,
      color: kind.color,
      progress,
      source: "SIMULATED",
      duration,
    };
  });
}
export function reportTravel(progress) {
  if (progress >= 1 || progress <= 0) return 0;
  if (progress < 0.28) return Math.sin(((progress / 0.28) * Math.PI) / 2);
  if (progress < 0.65) return 1;
  return Math.max(0, Math.cos((((progress - 0.65) / 0.35) * Math.PI) / 2));
}
