import { conditionToDisplay } from "@/lib/category-translate";

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  let colorClass = "bg-gray-100 text-gray-700 border-gray-200";
  
  switch (status?.toLowerCase()) {
    case "new":
    case "excellent":
      colorClass = "bg-green-50 text-green-700 border-green-200";
      break;
    case "good":
      colorClass = "bg-blue-50 text-blue-700 border-blue-200";
      break;
    case "fair":
      colorClass = "bg-yellow-50 text-yellow-700 border-yellow-200";
      break;
    case "poor":
    case "damaged":
      colorClass = "bg-red-50 text-red-700 border-red-200";
      break;
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
      {conditionToDisplay(status)}
    </span>
  );
}
