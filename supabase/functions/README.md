# Edge Functions

The files here are the source of truth. Deploys happen **from these files only** —
never from an editor buffer, never straight into the dashboard. The one time that
rule was skipped, the only door into the app (`redeem-invite`) lived exclusively in
production with no reviewable, diffable, revertible copy anywhere. This directory
exists because recovering from that took an introspection session.

| Function | `verify_jwt` | Why |
|---|---|---|
| `redeem-invite` | **off** | The invite code *is* the credential — someone signing up cannot present a JWT yet. Origin allowlist + single opaque rejection message compensate. |
| `delete-account` | **on** | May only ever delete the caller. The JWT is both the authentication and the target: no user id is accepted from the body. |

Both functions are the only holders of the service role key, injected by the
platform as `SUPABASE_SERVICE_ROLE_KEY` — it is never pasted anywhere.

Changing a function: edit the file here, commit, then deploy via MCP
`deploy_edge_function` with the file's content verbatim. Schema changes ride the
same rule in `../migrations/`: file first, then `apply_migration` with the same
name.
