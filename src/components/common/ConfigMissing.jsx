export default function ConfigMissing() {
  return (
    <div className="config-missing">
      <h1>Falta configurar Supabase</h1>
      <p>
        No se encontraron las variables <code>VITE_SUPABASE_URL</code> y{' '}
        <code>VITE_SUPABASE_ANON_KEY</code>.
      </p>
      <ol>
        <li>
          Copia <code>.env.example</code> a <code>.env</code>.
        </li>
        <li>Llena los valores con los de tu proyecto de Supabase (Project Settings → API).</li>
        <li>Reinicia el servidor de desarrollo (<code>npm run dev</code>).</li>
      </ol>
    </div>
  )
}
