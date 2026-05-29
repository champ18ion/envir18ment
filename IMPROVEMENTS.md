# Pending Improvements

## 1. 401 Interceptor — web `lib/api.ts`
Create `apps/web/src/lib/api.ts` with an `apiFetch` wrapper.
On 401: clear all localStorage/sessionStorage auth keys → `window.location.replace("/login?reason=expired")`.
Use this in all dashboard page `useEffect` loads (the fetch calls that run on page mount).

## 2. Session Lost UX — login page banner
When `e18_privateKey` is missing from sessionStorage but token exists, redirect to `/login?reason=session` instead of `/login`.
On the login page, read `?reason` from the URL and show a yellow banner:
- `expired` → "Your session expired — sign in to continue"
- `session` → "Your encryption key was cleared — sign in to re-derive it"

## 3. Workspace Rename & Delete

**API** (`apps/api/src/routes/workspaces.ts`) — add at the end:
```ts
workspaceRouter.delete('/:id', async (req, res) => {
  // check member.role === 'owner'
  // db.delete(workspaces).where(eq(workspaces.id, req.params.id))
  // cascade handles members, projects, envs, secrets
  res.status(204).send()
})
```
API already has `PATCH /:id` for rename — no change needed there.

**UI** (`apps/web/src/app/dashboard/[workspaceSlug]/page.tsx`):
- Add state: `renamingWs`, `renameWsName`, `deleteWsConfirm`, `wsLoading`
- Add imports: `Pencil`, `Trash2` from lucide-react; `apiFetch` from `@/lib/api`
- In the header next to the workspace name: Pencil icon (admin+) and Trash icon (owner only)
- Rename form: inline input + Save/Cancel — on success redirect to `/dashboard/${newSlug}` if slug changed
- Delete confirm: inline danger box — on success redirect to `/dashboard`

## 4. Project Rename & Delete

**API** (`apps/api/src/routes/projects.ts`) — add at the end:
```ts
projectRouter.patch('/:id', ...) // update name + slug, admin/owner only
projectRouter.delete('/:id', ...) // cascade handles envs/secrets, admin/owner only
```

**UI** (`apps/web/src/app/dashboard/[workspaceSlug]/page.tsx`):
- Add state: `renamingProject: string | null`, `renameProjectName`, `deleteProjectConfirm: string | null`
- Restructure project cards: remove `<Link>` wrapper, keep `<Link>` on the project name only, add Pencil+Trash icon buttons in top-right of card (admin+ only)
- Inline rename form inside the card
- Inline delete confirmation inside the card

## 5. Fix Hardcoded Env Names on Project Cards

Same file as above (`apps/web/src/app/dashboard/[workspaceSlug]/page.tsx`).
Replace `<p>development · staging · production</p>` with `<p>Click to manage secrets →</p>` (or remove it).
No API change needed.

## 6. Leave Workspace

**API** (`apps/api/src/routes/members.ts`) — add BEFORE `membersRouter.delete('/:userId', ...)`:
```ts
membersRouter.delete('/me', async (req, res) => {
  // workspaceId from query
  // check me.role !== 'owner' (owners must delete workspace instead)
  // delete environmentKeys for all envs in workspace
  // delete workspaceMembers row
  res.status(204).send()
})
```

**UI** (`apps/web/src/app/dashboard/[workspaceSlug]/members/page.tsx`):
- Add state: `leaveConfirm`, `leavingWs`
- Add `leaveWorkspace()` function: `DELETE /api/members/me?workspaceId=...` → redirect to `/dashboard`
- Below the members list, for non-owners: "Leave workspace" text button → inline confirm

## 7. e18 Link Interactive Picker

**CLI** (`apps/cli/src/commands/link.ts`):
- Change argument from `<ref>` (required) to `[ref]` (optional)
- When `ref` is undefined, run interactive flow using `prompts` (already a dep):
  1. `GET /api/workspaces` → select workspace
  2. `GET /api/workspaces/:slug` → get workspace.id
  3. `GET /api/projects?workspaceId=...` → select project
  4. `GET /api/environments?projectId=...` → select environment
  5. Build `ref = "${wsSlug}/${projSlug}/${envName}"`
- Then continue with existing `resolveEnv(ref)` + `writeFileSync('.e18', ...)` logic

## 8. Duplicate Secret Key Warning

**UI** (`apps/web/src/app/dashboard/[workspaceSlug]/[projectSlug]/page.tsx`):

In the single-add form (lines ~302-318): below the key input, show warning when key already exists:
```tsx
{addKey && rows.some(r => r.key === addKey) && (
  <p style={{ fontSize: "11px", color: "#fbbf24", marginTop: "4px" }}>Exists — will overwrite</p>
)}
```

In the import preview (lines ~280-289): add an "update" badge next to each key that already exists in `rows`:
```tsx
{rows.some(r => r.key === p.key) && (
  <span style={{ ...yellow badge styles... }}>update</span>
)}
```

## 9. CLI 401 Handling ✅ Already done
`apps/cli/src/lib/api.ts` already handles 401: prints "Session expired. Run: e18 login" and exits.
