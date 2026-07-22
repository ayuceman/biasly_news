import { cn } from "@/lib/utils";

type BiasMeterProps = {
  leftPercentage: number;
  centerPercentage: number;
  rightPercentage: number;
  variant?: "bar" | "pills";
  className?: string;
};

function BiasMeter({
  leftPercentage,
  centerPercentage,
  rightPercentage,
  variant = "bar",
  className,
}: BiasMeterProps) {
  if (variant === "pills") {
    return (
      <div
        className={cn(
          "flex h-7 w-full overflow-hidden rounded-md",
          className
        )}
      >
        <div
          className="flex items-center justify-center overflow-hidden bg-left-bias text-caption font-semibold whitespace-nowrap text-white"
          style={{ width: `${leftPercentage}%` }}
        >
          Left {leftPercentage}%
        </div>
        <div
          className="flex items-center justify-center overflow-hidden bg-muted text-caption font-semibold whitespace-nowrap text-foreground"
          style={{ width: `${centerPercentage}%` }}
        >
          Center {centerPercentage}%
        </div>
        <div
          className="flex items-center justify-center overflow-hidden bg-right-bias text-caption font-semibold whitespace-nowrap text-white"
          style={{ width: `${rightPercentage}%` }}
        >
          Right {rightPercentage}%
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="flex h-8 w-full overflow-hidden rounded-md">
        <div
          className="flex items-center justify-center bg-left-bias text-caption font-semibold text-white"
          style={{ width: `${leftPercentage}%` }}
        >
          Left {leftPercentage}%
        </div>
        <div
          className="flex items-center justify-center bg-center-bias text-caption font-semibold text-foreground"
          style={{ width: `${centerPercentage}%` }}
        >
          Center {centerPercentage}%
        </div>
        <div
          className="flex items-center justify-center bg-right-bias text-caption font-semibold text-white"
          style={{ width: `${rightPercentage}%` }}
        >
          Right {rightPercentage}%
        </div>
      </div>
      <div className="mt-1 flex justify-between text-caption text-text-secondary">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

export { BiasMeter };
