/**
 * The setup checklist: the first of Today's four blocks (section 3; section 8, "Checklists").
 * A progress ring ("2 of 3"), the next unfinished step, and one button: the only primary button
 * Today ever has (UX-HM-6). It shows until setup is complete, then never again.
 *
 * The seam for work package WP-27 (activation), which builds the checklist and its steps. Until
 * then nobody has one, so this returns null: Today shows no first block and no primary button,
 * and "all caught up" doesn't offer "finish setup" (UX-HM-7). WP-27 fills this in from what the
 * person has done; Today already asks it, and already leaves the block's place for it.
 */
export interface SetupChecklist {
  done: number;
  total: number;
  /** The next unfinished step: its name, one line of why, and where its one button leads. */
  next: { title: string; why: string; action: string; href: string };
}

export function setupChecklistFor(_person: { userId: string }): SetupChecklist | null {
  return null;
}
