import Link from "next/link";

export default function Home() {
  return <main className="entry-page">
    <div className="brand-mark" aria-hidden="true">S</div>
    <p className="eyebrow">PESAN LANGSUNG DARI MEJA</p>
    <h1>Selamat datang.</h1>
    <p>Pindai kode QR di meja Anda untuk melihat menu dan mulai memesan.</p>
    <hr />
    <p className="muted">Arahkan kamera ponsel ke kode QR yang tersedia di meja.</p>
    <Link className="text-button" href="/login">Masuk Staf</Link>
  </main>;
}
