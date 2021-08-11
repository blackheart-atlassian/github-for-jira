import LaunchDarkly, { LDUser } from "launchdarkly-node-server-sdk";
import { getLogger } from "./logger";
import envVars from "./env";
import crypto from "crypto";

const logger = getLogger("feature-flags");

const launchdarklyClient = LaunchDarkly.init(envVars.LAUNCHDARKLY_KEY, {
	logger,
	offline: !envVars.LAUNCHDARKLY_KEY
});

export enum BooleanFlags {
	MAINTENANCE_MODE = "maintenance-mode",
}

export enum StringFlags {
	OTHER_STRING_FLAG = "other-string-flag",
}

const createLaunchdarklyUser = (jiraHost?: string): LDUser => {
	if (!jiraHost) {
		return {
			key: "global"
		};
	}

	const hash = crypto.createHash("sha1");
	hash.update(jiraHost);
	return {
		key: hash.digest("hex")
	};
}

const getLaunchDarklyValue = async (flag: BooleanFlags | StringFlags, defaultValue: boolean | string, jiraHost?: string): Promise<boolean | string> => {
	try {
		await launchdarklyClient.waitForInitialization();
		const user = createLaunchdarklyUser(jiraHost);
		return launchdarklyClient.variation(flag, user, defaultValue);
	} catch (err: unknown) {
		logger.error(`Error resolving value for feature flag "${flag}"`, err);
		return defaultValue;
	}
}

export const booleanFlag = async (flag: BooleanFlags, defaultValue: boolean, jiraHost?: string): Promise<boolean> =>
	Boolean(await getLaunchDarklyValue(flag, defaultValue, jiraHost));

export const stringFlag = async (flag: StringFlags, defaultValue: string, jiraHost?: string): Promise<string> =>
	String(await getLaunchDarklyValue(flag, defaultValue, jiraHost));