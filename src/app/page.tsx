import Link from "next/link";
import { Brand } from "@/components/ui/brand";

export default function Home() {
  return <main className="entry-page">
    <Brand />
    <h1>Pesan dari meja Anda.</h1>
    <p>Pindai kode QR di meja Anda untuk melihat menu dan mulai memesan.</p>
    <hr />
    <p className="muted">Arahkan kamera ponsel ke kode QR yang tersedia di meja.</p>
    <div className="entry-access"><Link className="secondary-button" href="/login">Masuk Kasir</Link><Link className="text-button" href="/owner-login">Masuk Pemilik</Link></div>
  </main>;
}
