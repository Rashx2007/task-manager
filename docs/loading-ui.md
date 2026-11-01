# Loading UI

Shared components: `LoadingIndicator` (spinner/skeleton, hidden accessible label, inline variant) and `ReadLoadingModal` (pending/error form boundary with Close).

## Coverage
- Main list: pending begins before fetch; latest-request-only completion; errors are distinct from successful empty results. Filters/page navigation set pending immediately. Simple/comprehensive search maintain separate main-list busy flags.
- Main column options: common indicator; read errors are not empty options.
- Independent inspector: filter options, sorting/pagination, selected task details and opening attachments.
- Persons, assets/base information, follow-up rows, fixed-time rows: pending/error/empty separated.
- Task, priority/time, purchase, applicant/functor, attachment-folder and settings forms: no editable initial defaults before their read finishes; failed reads cannot be mistaken for blank records.
- File/folder/DWG browsers: pending before first request, common indicator and latest-request guards.
- Reports, map/SVG read/conversion, backup file list/operations and search panels: shared indicators.
- Context headers and request/purchase hover information: inline indicator.

No new runtime dependency. No API/SQL/schema, scheduling, status-history or group behavior change. Existing write handlers remain unchanged; some busy-button text is replaced by an indicator.

## Validation
100 Node tests with mock I/O: normal LF and CRLF file contents. Four additional local React server-render checks: loading, empty success, error, and stale records hidden while pending. JSX parsed for all components/page. This is not a live SQL Server or full browser test.

Visual checks: throttle/slow connection; check first main load, column options and filter/page transitions, inspector, persons/assets/follow/fixed lists, forms, files/folders, map/report and backup. Spinner must disappear after success/failure; empty text must occur only after successful empty reads. Close remains accessible. Respect `prefers-reduced-motion`.
