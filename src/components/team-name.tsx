import { getTeamColors } from "@/lib/colors";
import { getDisplayName } from "@/lib/display-name";

export function TeamName({
  name,
  primaryColor,
  secondaryColor,
}: {
  name: string;
  primaryColor?: string;
  secondaryColor?: string;
}) {
  const { primary, secondary } = getTeamColors(primaryColor, secondaryColor);
  return (
    <span
      className="font-extrabold"
      style={{
        backgroundImage: `linear-gradient(90deg, ${primary}, ${secondary})`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }}
    >
      {getDisplayName(name)}
    </span>
  );
}
