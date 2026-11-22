-- Restrict the application SQL principal to the application objects it needs.
-- The application never uses db_datareader/db_datawriter over the whole database.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF DATABASE_PRINCIPAL_ID(N'nipco_app') IS NULL
    THROW 50010, 'Application database principal nipco_app is missing.', 1;
IF DATABASE_PRINCIPAL_ID(N'nipco_runtime') IS NULL
    CREATE ROLE nipco_runtime AUTHORIZATION dbo;
IF IS_ROLEMEMBER(N'db_datareader', N'nipco_app') = 1
    ALTER ROLE db_datareader DROP MEMBER nipco_app;
IF IS_ROLEMEMBER(N'db_datawriter', N'nipco_app') = 1
    ALTER ROLE db_datawriter DROP MEMBER nipco_app;
IF IS_ROLEMEMBER(N'nipco_runtime', N'nipco_app') <> 1
    ALTER ROLE nipco_runtime ADD MEMBER nipco_app;
GRANT SELECT, INSERT, UPDATE ON OBJECT::control.Users TO nipco_runtime;
GRANT SELECT, INSERT, DELETE ON OBJECT::control.Sessions TO nipco_runtime;
GRANT SELECT, INSERT, UPDATE ON OBJECT::control.AppState TO nipco_runtime;
GRANT SELECT, INSERT, DELETE ON OBJECT::control.BackupHistory TO nipco_runtime;
COMMIT TRANSACTION;
