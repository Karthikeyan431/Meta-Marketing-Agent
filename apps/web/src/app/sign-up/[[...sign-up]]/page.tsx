import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <section aria-labelledby="sign-up-heading">
      <h1 id="sign-up-heading">Sign up</h1>
      <SignUp />
    </section>
  );
}
