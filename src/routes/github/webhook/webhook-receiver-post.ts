import { BinaryLike, createHmac } from "crypto";
import { Request, Response } from "express";
import { getLogger } from "~/src/config/logger";
import { pushWebhookHandler } from "~/src/github/push";
import { GithubWebhookMiddleware } from "~/src/middleware/github-webhook-middleware";
import { GitHubServerApp } from "models/github-server-app";
import { WebhookContext } from "./webhook-context";

export const WebhookReceiverPost = async (request: Request, response: Response): Promise<void> => {
	const logger = getLogger("webhook.receiver");
	const eventName = request.headers["x-github-event"] as string;
	const signatureSHA256 = request.headers["x-hub-signature-256"] as string;
	const id = request.headers["x-github-delivery"] as string;
	const uuid = request.params.uuid;
	const payload = request.body;
	let webhookSecret: string;
	try {
		const gitHubServerApp = await GitHubServerApp.findForUuid(uuid);
		if (!gitHubServerApp) {
			response.status(400).send("GitHub app not found");
			return;
		}
		webhookSecret = gitHubServerApp.webhookSecret;
		const verification = createHash(JSON.stringify(payload), webhookSecret);
		if (verification != signatureSHA256) {
			response.status(400).send("signature does not match event payload and secret");
			return;
		}

		const webhookContext = new WebhookContext({
			id: id,
			name: eventName,
			payload: payload,
			log: logger,
			action: payload.action
		});
		webhookRouter(webhookContext);
		response.sendStatus(204);

	} catch (error) {
		response.sendStatus(500);
		logger.error(error);
	}
};

const webhookRouter = (context: WebhookContext) => {
	if (context.action) {
		invokeHandler(`${context.name}.${context.action}`, context);
	}
	invokeHandler(`${context.name}`, context);
};

const invokeHandler = (event: string, context: WebhookContext) => {
	switch (event) {
		case "push":
			GithubWebhookMiddleware(pushWebhookHandler)(context);
			break;
		case "pull_request":
			context.log.info("pull req event Received!");
			break;
		case "pull_request.opened":
			context.log.info("pull req opened event Received!");
			break;
	}
};

const createHash = (data: BinaryLike, secret: string): string => {
	return `sha256=${createHmac("sha256", secret)
		.update(data)
		.digest("hex")}`;
};