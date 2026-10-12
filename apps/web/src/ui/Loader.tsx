interface Props {
  message?: string;
  error?: string;
  onRetry?(): void;
}

/** Pantalla de carga a pantalla completa durante el arranque de la app. */
export function Loader({ message = 'Cargando Oficina Virtual…', error = '', onRetry }: Props) {
  return (
    <main id="loader" role="status" aria-live="polite">
      <span className="loaderLogo" aria-hidden="true">🏢</span>
      {error ? (
        <>
          <p className="error">{error}</p>
          {onRetry && <button type="button" className="primary" onClick={onRetry}>Reintentar</button>}
        </>
      ) : (
        <>
          <span className="spinner" aria-hidden="true" />
          <p className="loaderText">{message}</p>
        </>
      )}
    </main>
  );
}
