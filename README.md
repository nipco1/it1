# NIPCO Daily Equipment Control

React/TypeScript frontend, Node.js HTTPS API, SQL Server persistence, and Windows deployment scripts.

## Deployment modes

- `Standalone`: application + SQL Server on one Windows 10/11 x64 workstation. Local-only URL: `https://localhost:8443`.
- `Server`: application + SQL Server on one Windows Server host. Windows clients use the HTTPS DNS name and port 8443.

Start with `README-FA.md` for the complete Persian installation guide. Windows scripts are under `deploy/windows/`.

This is a PowerShell/CMD deployment kit, not a signed MSI/EXE package. The Windows Service host is compiled on the target Windows machine. Windows, SQL Server, simultaneous-client, and restore tests must still be performed on the destination environment before production sign-off.

## Local developer checks

```bash
npm run test:logic
npm --prefix server run check
npm run typecheck
npm run build
npm --prefix server test
```

Full install/build uses the locked npm dependencies in both root and `server/` packages. The application data payload is currently stored as JSON in SQL Server table `control.AppState`; see `STATUS-FA.md` for the current architectural and test limitations.
