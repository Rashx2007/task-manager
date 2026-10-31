-- Status-history foundation only: no existing task or schedule data is changed.
-- Run after making a fresh backup, in a NEW SSMS query with no open transaction.
USE [WorkDB];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'WorkDB'
    THROW 51000, 'Wrong database. Expected WorkDB.', 1;
IF @@TRANCOUNT <> 0
    THROW 51000, 'An existing transaction is open. Use a new query window.', 1;
IF (@@OPTIONS & 2) = 2
    THROW 51000, 'IMPLICIT_TRANSACTIONS is enabled. Use an explicit-transaction session.', 1;
IF (SELECT compatibility_level FROM sys.databases WHERE database_id = DB_ID()) < 130
    THROW 51000, 'Database compatibility level 130 or newer is required. No change was made.', 1;

BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @LockResult int;
    EXEC @LockResult = sys.sp_getapplock
        @Resource = N'task-manager:task-status-history-schema',
        @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 10000;
    IF @LockResult < 0
        THROW 51000, 'Status-history schema is busy. Retry later.', 1;

    IF OBJECT_ID(N'dbo.TaskStatusHistory') IS NOT NULL
       AND OBJECT_ID(N'dbo.TaskStatusHistory', N'U') IS NULL
        THROW 51000, 'TaskStatusHistory exists but is not a table. Nothing was replaced.', 1;

    IF OBJECT_ID(N'dbo.TaskStatusHistory', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.TaskStatusHistory (
            HistoryID bigint IDENTITY(1,1) NOT NULL,
            OperationID uniqueidentifier NOT NULL,
            TaskID int NOT NULL,
            Action nvarchar(16) NOT NULL,
            BeforeStatus bit NOT NULL,
            AfterStatus bit NOT NULL,
            BeforeState nvarchar(max) NOT NULL,
            AfterState nvarchar(max) NOT NULL,
            CreatedAtUTC datetime2(3) NOT NULL
                CONSTRAINT DF_TaskStatusHistory_CreatedAt DEFAULT SYSUTCDATETIME(),
            OccurredAtWall datetime2(0) NOT NULL,
            Source nvarchar(100) NOT NULL,
            DatabaseLogin nvarchar(128) NOT NULL
                CONSTRAINT DF_TaskStatusHistory_Login DEFAULT ORIGINAL_LOGIN(),
            AppActor nvarchar(128) NULL,
            RestoresHistoryID bigint NULL,
            CONSTRAINT PK_TaskStatusHistory PRIMARY KEY CLUSTERED (HistoryID),
            CONSTRAINT UQ_TaskStatusHistory_Operation UNIQUE (OperationID),
            CONSTRAINT UQ_TaskStatusHistory_HistoryTask UNIQUE (HistoryID, TaskID),
            CONSTRAINT CK_TaskStatusHistory_TaskID CHECK (TaskID > 0),
            CONSTRAINT CK_TaskStatusHistory_Action CHECK (Action IN (N'COMPLETE', N'REOPEN', N'RESTORE')),
            CONSTRAINT CK_TaskStatusHistory_BeforeJSON CHECK (ISJSON(BeforeState) = 1),
            CONSTRAINT CK_TaskStatusHistory_AfterJSON CHECK (ISJSON(AfterState) = 1),
            CONSTRAINT CK_TaskStatusHistory_Transition CHECK (
                (Action = N'COMPLETE' AND BeforeStatus = 0 AND AfterStatus = 1)
                OR (Action = N'REOPEN' AND BeforeStatus = 1 AND AfterStatus = 0)
                OR Action = N'RESTORE'
            ),
            CONSTRAINT FK_TaskStatusHistory_Restores FOREIGN KEY (RestoresHistoryID, TaskID)
                REFERENCES dbo.TaskStatusHistory(HistoryID, TaskID)
        );
        CREATE INDEX IX_TaskStatusHistory_Task
            ON dbo.TaskStatusHistory(TaskID, HistoryID DESC);
        EXEC sys.sp_addextendedproperty
            @name = N'TaskStatusHistorySchemaVersion',
            @value = N'20261030_001_status_history',
            @level0type = N'SCHEMA', @level0name = N'dbo',
            @level1type = N'TABLE', @level1name = N'TaskStatusHistory';
    END;

    DECLARE @ObjectID int = OBJECT_ID(N'dbo.TaskStatusHistory', N'U');
    IF NOT EXISTS (
        SELECT 1 FROM sys.extended_properties
        WHERE class = 1 AND major_id = @ObjectID AND minor_id = 0
          AND name = N'TaskStatusHistorySchemaVersion'
          AND CONVERT(nvarchar(100), value) = N'20261030_001_status_history'
    )
        THROW 51000, 'Existing history schema version is unknown. No table was adopted or replaced.', 1;

    DECLARE @Expected TABLE (
        ColumnName sysname, TypeName sysname, MaxLength smallint NULL,
        IsNullable bit, IsIdentity bit, ExpectedScale tinyint NULL
    );
    INSERT INTO @Expected VALUES
        (N'HistoryID', N'bigint', 8, 0, 1, NULL),
        (N'OperationID', N'uniqueidentifier', 16, 0, 0, NULL),
        (N'TaskID', N'int', 4, 0, 0, NULL),
        (N'Action', N'nvarchar', 32, 0, 0, NULL),
        (N'BeforeStatus', N'bit', 1, 0, 0, NULL),
        (N'AfterStatus', N'bit', 1, 0, 0, NULL),
        (N'BeforeState', N'nvarchar', -1, 0, 0, NULL),
        (N'AfterState', N'nvarchar', -1, 0, 0, NULL),
        (N'CreatedAtUTC', N'datetime2', NULL, 0, 0, 3),
        (N'OccurredAtWall', N'datetime2', NULL, 0, 0, 0),
        (N'Source', N'nvarchar', 200, 0, 0, NULL),
        (N'DatabaseLogin', N'nvarchar', 256, 0, 0, NULL),
        (N'AppActor', N'nvarchar', 256, 1, 0, NULL),
        (N'RestoresHistoryID', N'bigint', 8, 1, 0, NULL);

    IF (SELECT COUNT(*) FROM sys.columns WHERE object_id = @ObjectID) <> 14
       OR EXISTS (
            SELECT 1 FROM @Expected e
            LEFT JOIN sys.columns c ON c.object_id = @ObjectID AND c.name = e.ColumnName
            LEFT JOIN sys.types t ON t.user_type_id = c.user_type_id
            WHERE c.column_id IS NULL OR t.name <> e.TypeName
               OR (e.MaxLength IS NOT NULL AND c.max_length <> e.MaxLength) OR c.is_nullable <> e.IsNullable
               OR c.is_identity <> e.IsIdentity OR c.is_computed <> 0
               OR (e.ExpectedScale IS NOT NULL AND c.scale <> e.ExpectedScale)
       )
        THROW 51000, 'History columns do not match the expected schema. No repair was attempted.', 1;

    IF (SELECT COUNT(*) FROM sys.check_constraints
        WHERE parent_object_id = @ObjectID AND is_disabled = 0 AND is_not_trusted = 0
          AND name IN (N'CK_TaskStatusHistory_TaskID', N'CK_TaskStatusHistory_Action',
                       N'CK_TaskStatusHistory_BeforeJSON', N'CK_TaskStatusHistory_AfterJSON',
                       N'CK_TaskStatusHistory_Transition')) <> 5
        THROW 51000, 'History safety checks are missing, disabled or untrusted.', 1;
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys
        WHERE parent_object_id = @ObjectID AND referenced_object_id = @ObjectID
          AND name = N'FK_TaskStatusHistory_Restores' AND is_disabled = 0 AND is_not_trusted = 0)
        THROW 51000, 'History restore ownership constraint is missing or untrusted.', 1;
    IF (SELECT COUNT(*) FROM sys.indexes
        WHERE object_id = @ObjectID AND is_unique = 1 AND is_disabled = 0
          AND has_filter = 0 AND name IN (N'PK_TaskStatusHistory',
              N'UQ_TaskStatusHistory_Operation', N'UQ_TaskStatusHistory_HistoryTask')) <> 3
        THROW 51000, 'History unique keys are missing or disabled.', 1;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes
        WHERE object_id = @ObjectID AND name = N'IX_TaskStatusHistory_Task'
          AND is_disabled = 0 AND has_filter = 0)
        THROW 51000, 'History task lookup index is missing or disabled.', 1;
    IF (SELECT COUNT(*) FROM sys.default_constraints
        WHERE parent_object_id = @ObjectID
          AND name IN (N'DF_TaskStatusHistory_CreatedAt', N'DF_TaskStatusHistory_Login')) <> 2
        THROW 51000, 'History timestamp/login defaults are missing.', 1;

    COMMIT TRANSACTION;
    SELECT N'Status history schema ready. Existing tasks and schedules were not changed.' AS Result,
        @@SERVERNAME AS ServerName, DB_NAME() AS DatabaseName,
        N'20261030_001_status_history' AS SchemaVersion,
        N'Application logging is not enabled by this migration.' AS ApplicationStatus;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
