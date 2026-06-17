import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-300 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:scale-[1.02] active:scale-[0.98] hover:opacity-95",
  {
    variants: {
      variant: {
        default:
          "bg-voyage-brand text-primary-foreground shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/35 hover:brightness-[1.05]",
        secondary:
          "border border-border/60 bg-secondary text-secondary-foreground backdrop-blur-sm hover:bg-secondary/90 hover:shadow-md hover:shadow-slate-900/5",
        ghost: "hover:bg-primary/10 hover:text-primary hover:shadow-sm",
        outline:
          "border border-border bg-background/90 hover:bg-muted/80 hover:shadow-md hover:shadow-primary/10",
        link: "text-primary underline-offset-4 hover:underline scale-100 hover:scale-100",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
