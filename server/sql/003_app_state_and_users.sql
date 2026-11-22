-- NIPCO production application state and user metadata.
-- Apply after 001_auth.sql. Does not drop or rewrite existing application data.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'control.Users', N'group_ids') IS NULL
  ALTER TABLE control.Users ADD group_ids NVARCHAR(MAX) NOT NULL CONSTRAINT DF_control_Users_group_ids DEFAULT N'[]';
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_control_Users_group_ids_json')
  EXEC(N'ALTER TABLE control.Users ADD CONSTRAINT CK_control_Users_group_ids_json CHECK (ISJSON(group_ids)=1 OR group_ids=N''"all"'')');
IF OBJECT_ID(N'control.AppState', N'U') IS NULL
BEGIN
  CREATE TABLE control.AppState (
    id TINYINT NOT NULL CONSTRAINT PK_control_AppState PRIMARY KEY CONSTRAINT CK_control_AppState_singleton CHECK (id=1),
    revision BIGINT NOT NULL,
    payload NVARCHAR(MAX) NOT NULL CONSTRAINT CK_control_AppState_payload_json CHECK (ISJSON(payload)=1),
    updated_by UNIQUEIDENTIFIER NULL REFERENCES control.Users(id),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_control_AppState_updated DEFAULT SYSUTCDATETIME()
  );
END;
IF OBJECT_ID(N'control.BackupHistory', N'U') IS NULL
BEGIN
  CREATE TABLE control.BackupHistory (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_control_BackupHistory PRIMARY KEY,
    file_name NVARCHAR(260) NOT NULL,
    file_size BIGINT NULL,
    backup_type VARCHAR(20) NOT NULL,
    created_by UNIQUEIDENTIFIER NULL REFERENCES control.Users(id),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_control_BackupHistory_created DEFAULT SYSUTCDATETIME(),
    verified BIT NOT NULL CONSTRAINT DF_control_BackupHistory_verified DEFAULT 0
  );
END;
COMMIT TRANSACTION;
