import { GauntletAtmosphere } from "./gauntlet-atmosphere";

export default function BracketLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GauntletAtmosphere />
      {children}
    </>
  );
}
