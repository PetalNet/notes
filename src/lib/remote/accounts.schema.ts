import { Schema } from "effect";

const UsernameSchema = Schema.String.pipe(
  Schema.pattern(/^[a-z0-9_-]+$/, {
    message: () => "Invalid username (alphanumeric only)",
  }),
  Schema.length(
    { min: 3, max: 31 },
    {
      message: () => "Invalid username (min 3, max 31 characters)",
    },
  ),
  Schema.annotations({
    title: "Username",
    description: "username",
    identifier: "Username",
  }),
);

const PasswordSchema = Schema.String.pipe(
  Schema.length(
    { min: 6, max: 255 },
    {
      message: () => ({
        message: "Invalid password (min 6, max 255 characters)",
        override: true,
      }),
    },
  ),
  Schema.brand("Password", {
    title: "Password",
    description: "password",
    identifier: "Password",
  }),
  Schema.Redacted,
);

export const LoginSchema = Schema.Struct({
  username: UsernameSchema,
  _password: PasswordSchema.annotations({
    title: "Password",
    description: "account password",
  }),
});

export const loginSchema = LoginSchema.pipe(Schema.standardSchemaV1);

export const SignupSchema = Schema.Struct({
  username: UsernameSchema,
  _password: PasswordSchema.annotations({
    title: "Password",
    description: "account password",
  }),
  publicKey: Schema.String,
  privateKeyEncrypted: Schema.String,
});

export const signupSchema = SignupSchema.pipe(Schema.standardSchemaV1);

export const ChangePasswordSchema = Schema.Struct({
  _password: PasswordSchema.annotations({
    title: "New Password",
  }),
  privateKeyEncrypted: Schema.String,
});

export const changePasswordSchema = ChangePasswordSchema.pipe(
  Schema.standardSchemaV1,
);

export const SetupEncryptionSchema = Schema.Struct({
  _password: PasswordSchema.annotations({
    title: "Current Password",
  }),
  publicKey: Schema.String,
  privateKeyEncrypted: Schema.String,
});

export const setupEncryptionSchema = SetupEncryptionSchema.pipe(
  Schema.standardSchemaV1,
);
