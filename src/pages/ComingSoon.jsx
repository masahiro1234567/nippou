import Layout from '../components/Layout';

export default function ComingSoon({ title }) {
  return (
    <Layout title={title} showBack>
      <div className="empty">
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>🚧</div>
        <p>{title}は次のフェーズで実装予定です</p>
      </div>
    </Layout>
  );
}
