import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/AuthShell";

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "bg-transparent shadow-none border-0",
            headerTitle: "text-foreground",
            headerSubtitle: "text-muted-foreground",
            socialButtonsBlockButton:
              "transition-all duration-300 ease-soft hover:scale-[1.01] border-border/60",
            formButtonPrimary: "transition-all duration-300 ease-soft hover:brightness-[1.03] shadow-md",
            formFieldInput:
              "bg-[hsl(195_45%_97%)] border-border/70 text-foreground transition-all duration-300",
          },
        }}
      />
    </AuthShell>
  );
}
