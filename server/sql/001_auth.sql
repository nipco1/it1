-- Foundation only. Execute with a privileged deployment account, not the runtime account.
-- Requires an existing database. Review and back up before applying.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF SCHEMA_ID(N'control') IS NULL EXEC(N'CREATE SCHEMA control');
IF OBJECT_ID(N'control.Users', N'U') IS NOT NULL OR OBJECT_ID(N'control.Sessions', N'U') IS NOT NULL
    THROW 50000, 'Authentication tables already exist; refusing to overwrite.', 1;
CREATE TABLE control.Users (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_control_Users PRIMARY KEY DEFAULT NEWID(),
    username NVARCHAR(128) NOT NULL CONSTRAINT UQ_control_Users_username UNIQUE,
    display_name NVARCHAR(200) NOT NULL,
    role VARCHAR(20) NOT NULL CONSTRAINT CK_control_Users_role CHECK (role IN ('admin','supervisor','engineer','technician','viewer')),
    password_hash NVARCHAR(512) NOT NULL,
    active BIT NOT NULL CONSTRAINT DF_control_Users_active DEFAULT 1
);
CREATE TABLE control.Sessions (
    token_hash CHAR(64) NOT NULL CONSTRAINT PK_control_Sessions PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    expires_at DATETIME2 NOT NULL,
    CONSTRAINT FK_control_Sessions_Users FOREIGN KEY(user_id) REFERENCES control.Users(id)
);
CREATE INDEX IX_control_Sessions_user ON control.Sessions(user_id);
CREATE INDEX IX_control_Sessions_expiry ON control.Sessions(expires_at);
COMMIT TRANSACTION;
