import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <section aria-labelledby="sign-in-heading">
      <h1 id="sign-in-heading">Sign in</h1>
      <SignIn />
    </section>
  );
}
