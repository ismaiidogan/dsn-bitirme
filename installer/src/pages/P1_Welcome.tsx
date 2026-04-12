interface Props { onNext: () => void }

export default function P1_Welcome({ onNext }: Props) {
  return (
    <>
      <div className="content">
        <div className="page-icon">🌐</div>
        <h1 className="page-title">DSN'e Hoş Geldiniz</h1>
        <p className="page-desc">
          Bu sihirbaz bilgisayarınızı Distributed Storage Network'e bir depolama node'u olarak
          bağlar. İşlem yaklaşık 2 dakika sürer — hiç terminal açmanız gerekmez.
        </p>

        <div className="features">
          <div className="feature">
            <div className="feat-icon">🔒</div>
            <div>
              <p className="feat-title">Uçtan Uca Şifreleme</p>
              <p className="feat-desc">Dosyalar bilgisayarınıza ulaşmadan önce AES-256-GCM ile şifrelenir. Hiçbir veriyi okuyamazsınız.</p>
            </div>
          </div>
          <div className="feature">
            <div className="feat-icon">💾</div>
            <div>
              <p className="feat-title">Siz Belirleyin</p>
              <p className="feat-desc">Ne kadar disk alanı ve bant genişliği paylaşacağınızı kendiniz seçersiniz. İstediğiniz zaman değiştirin.</p>
            </div>
          </div>
          <div className="feature">
            <div className="feat-icon">⚡</div>
            <div>
              <p className="feat-title">Arka Planda Çalışır</p>
              <p className="feat-desc">Kurulum bittikten sonra sistem tepsisinde sessizce çalışır. Bilgisayar açılışında otomatik başlar.</p>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 24,
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--border-subtle)",
            background: "rgba(15,23,42,0.6)",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Gizlilik Güvencesi</p>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>✅ Dosyalar yalnızca senin seçtiğin klasöre kaydedilir.</li>
            <li>✅ Uygulama başka hiçbir klasöre veya dosyana erişemez.</li>
            <li>
              ✅ Sakladığın dosyaların içeriğini sen de dahil kimse okuyamaz — her şey şifreli
              gelir.
            </li>
          </ul>
        </div>
      </div>

      <div className="footer">
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          Devam ederek kullanım koşullarını kabul etmiş sayılırsınız.
        </span>
        <div className="footer-right">
          <button className="btn btn-primary" onClick={onNext}>
            Başla →
          </button>
        </div>
      </div>
    </>
  );
}
