export default function Offline() {
  return (
    <main className="offline-page">
      <span className="eyebrow">BINGO DEMONSTRAÇÃO</span>
      <h1>Sem conexão no momento.</h1>
      <p>
        As rodadas continuam no servidor. Suas cartelas e resultados permanecem registrados. Compras
        precisam de conexão e confirmação do servidor.
      </p>
      <a className="primary" href="/">
        Tentar novamente
      </a>
      <p>Créditos fictícios, sem valor monetário.</p>
    </main>
  );
}
