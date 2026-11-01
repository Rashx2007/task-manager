"use client";

export default function LoadingIndicator({ label = "در حال بارگذاری اطلاعات", inline = false }) {
  return <span role="status" aria-live="polite" aria-atomic="true" aria-label={label}
    className={`app-loading${inline ? ' app-loading--inline' : ''}`}>
    <span className="app-loading__spinner" aria-hidden="true" />
    {!inline && <span className="app-loading__lines" aria-hidden="true"><span /><span /><span /></span>}
    <span className="sr-only">{label}</span>
  </span>;
}
