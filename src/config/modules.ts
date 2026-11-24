// One place to switch modules on/off per phase.
// A module that is not enabled never ships a single byte to the phone
// beyond this list, because every module is behind its own dynamic import.

export type ModuleId =
  | "family-tree"
  | "profiles"
  | "chat"
  | "invites"
  | "backup"
  | "events"
  | "calendar"
  | "matrimony"
  | "logistics";

export interface ModuleInfo {
  id: ModuleId;
  label: string;
  labelTa: string;
  route: string;
  phase: 1 | 2 | 3 | 4;
  enabled: boolean;
  showInNav: boolean;
}

export const MODULES: readonly ModuleInfo[] = [
  { id: "family-tree", label: "Family Tree", labelTa: "குடும்ப மரம்", route: "/tree/", phase: 1, enabled: true, showInNav: true },
  { id: "profiles", label: "Profile", labelTa: "சுயவிவரம்", route: "/person/", phase: 1, enabled: true, showInNav: false },
  { id: "chat", label: "Family Chat", labelTa: "குடும்ப அரட்டை", route: "/chat/", phase: 1, enabled: true, showInNav: true },
  { id: "invites", label: "Invite", labelTa: "அழைப்பு", route: "/invite/", phase: 1, enabled: true, showInNav: false },
  { id: "backup", label: "Backup", labelTa: "காப்புப்பிரதி", route: "/backup/", phase: 1, enabled: true, showInNav: false },
  { id: "events", label: "Functions", labelTa: "விழாக்கள்", route: "/events/", phase: 2, enabled: false, showInNav: true },
  { id: "calendar", label: "Calendar", labelTa: "நாட்காட்டி", route: "/calendar/", phase: 2, enabled: false, showInNav: true },
  { id: "matrimony", label: "Matrimony", labelTa: "திருமணம்", route: "/matrimony/", phase: 3, enabled: false, showInNav: true },
  { id: "logistics", label: "Transport", labelTa: "போக்குவரத்து", route: "/logistics/", phase: 4, enabled: false, showInNav: true },
];

export const enabledNav = () => MODULES.filter((m) => m.enabled && m.showInNav);
