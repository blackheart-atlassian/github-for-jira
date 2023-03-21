import { BackfillMessagePayload, ErrorHandler, ErrorHandlingResult, SQSMessageContext } from "~/src/sqs/sqs.types";
import { markCurrentTaskAsFailedAndContinue, TaskError } from "~/src/sync/installation";
import { Task } from "~/src/sync/sync.types";
import { handleUnknownError } from "~/src/sqs/error-handlers";
import Logger from "bunyan";
import { SQS } from "aws-sdk";

const handleTaskError = async (sendSQSBackfillMessage: (message, delaySec, logger) => Promise<SQS.SendMessageResult>, task: Task, cause: Error, context: SQSMessageContext<BackfillMessagePayload>, rootLogger: Logger
) => {
	const log = rootLogger.child({
		task,
		receiveCount: context.receiveCount,
		lastAttempt: context.lastAttempt
	});
	log.info("Handling error task");

	// TODO: add task-related logic: e.g. mark as complete for 404; retry RateLimiting errors;

	if (context.lastAttempt) {
		// Otherwise the sync will be "stuck", not something we want
		log.warn("That was the last attempt: marking the task as failed and continue with the next one");
		await markCurrentTaskAsFailedAndContinue(context.payload, task, async (delayMs) => {
			return await sendSQSBackfillMessage(context.payload, delayMs / 1000, log);
		}, log);
		return {
			isFailure: false
		};
	}

	return handleUnknownError(cause, context);
};

export const backfillErrorHandler: (sendSQSBackfillMessage: (message, delaySec, logger) => Promise<SQS.SendMessageResult>) => ErrorHandler<BackfillMessagePayload> =
	(sendSQSBackfillMessage) =>
		async (err: Error, context: SQSMessageContext<BackfillMessagePayload>): Promise<ErrorHandlingResult> => {
			const log = context.log.child({ err });
			log.info("Handling error");

			if (err instanceof TaskError) {
				return await handleTaskError(sendSQSBackfillMessage, err.task, err.cause, context, log);
			}

			return handleUnknownError(err, context);
		};