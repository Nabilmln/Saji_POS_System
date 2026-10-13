import { PosReservations } from "@/components/pos-reservations";

// The staff layout defers this segment until its client-side access check finishes.
export const instant = false;

export default function ReservationsPage() { return <PosReservations />; }
