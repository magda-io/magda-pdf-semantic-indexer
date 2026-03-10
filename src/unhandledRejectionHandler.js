const HANDLER_INSTALLED_SYMBOL = Symbol.for(
    "magda.pdf.semantic.indexer.unhandledRejectionHandlerInstalled"
);

export function isRecoverableUnhandledRejection(reason) {
    return (
        typeof reason === "object" &&
        reason !== null &&
        "code" in reason &&
        reason.code === "ERR_TRAILING_JUNK_AFTER_STREAM_END"
    );
}

export function createUnhandledRejectionHandler(logger = console) {
    return (reason) => {
        if (isRecoverableUnhandledRejection(reason)) {
            const errorCode = reason.code;
            logger.error(
                `Recoverable unhandled rejection while processing file (${errorCode}):`,
                reason
            );
            return;
        }
        logger.error("Unhandled Rejection:", reason);
    };
}

export function installUnhandledRejectionLogger(logger = console) {
    if (globalThis[HANDLER_INSTALLED_SYMBOL]) {
        return false;
    }
    process.on("unhandledRejection", createUnhandledRejectionHandler(logger));
    globalThis[HANDLER_INSTALLED_SYMBOL] = true;
    return true;
}
