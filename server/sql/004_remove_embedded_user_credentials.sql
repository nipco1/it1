-- Remove any account object previously embedded in the application JSON document.
-- User identity/password hashes belong only in control.Users. This migration is
-- intentionally narrow: only the $.users property is removed; all operational
-- records, revisions and audit history are preserved (revision is incremented).
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'control.AppState', N'U') IS NOT NULL
BEGIN
  UPDATE control.AppState
     SET payload = JSON_MODIFY(payload, '$.users', NULL),
         revision = revision + 1,
         updated_at = SYSUTCDATETIME()
   WHERE id = 1
     AND ISJSON(payload) = 1
     AND JSON_QUERY(payload, '$.users') IS NOT NULL;
END;
COMMIT TRANSACTION;
