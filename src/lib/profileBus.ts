// Any name or face in the app can open that person's profile without threading callbacks everywhere.
export const PROFILE_EVENT = "thaew:profile";
export function openProfile(id: string | null | undefined) {
  if (id) window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: id }));
}
