CREATE TABLE `note_shares` (
	`id` text PRIMARY KEY,
	`note_id` text NOT NULL,
	`shared_with_user` text NOT NULL,
	`encrypted_key` text NOT NULL,
	`permissions` text DEFAULT 'read' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_note_shares_note_id_notes_id_fk` FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`owner_id` text NOT NULL,
	`encrypted_key` text NOT NULL,
	`loro_snapshot` text,
	`parent_id` text,
	`is_folder` integer DEFAULT 0 NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_notes_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT `fk_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`username` text NOT NULL UNIQUE,
	`password_hash` text NOT NULL,
	`public_key` text NOT NULL,
	`private_key_encrypted` text NOT NULL,
	`created_at` integer NOT NULL
);
