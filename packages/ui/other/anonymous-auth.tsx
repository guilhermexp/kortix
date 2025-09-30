"use client";

import { authClient } from "@lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export const AnonymousAuth = ({
	dashboardPath = "/",
	loginPath = "/login",
}) => {
	const router = useRouter();

	useEffect(() => {
		(async () => {
			try {
				await authClient.signIn.anonymous();
				router.push(dashboardPath);
			} catch (error) {
				console.error("[ANONYMOUS_AUTH] Failed to create anonymous session", error);
				router.push(loginPath);
			}
		})();
	}, [dashboardPath, loginPath, router]);

	return null;
};
