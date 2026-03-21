export type TokenEstimateAttachment = {
  type: "image" | "file";
  data?: string;
  fileId?: string;
};

export type TokenEstimateMessage = {
  content: string;
  attachments?: TokenEstimateAttachment[];
};

export function estimateImagePromptTokens(attachment: TokenEstimateAttachment) {
  if (attachment.data) {
    const base64Payload = attachment.data.startsWith("data:")
      ? (attachment.data.split(",", 2)[1] ?? "")
      : attachment.data;
    const approxBytes = Math.ceil((base64Payload.length * 3) / 4);
    const estimateFromBytes = Math.ceil(approxBytes / 4);
    return Math.min(Math.max(estimateFromBytes, 400), 3_200);
  }
  if (attachment.fileId) {
    return 1_000;
  }
  return 900;
}

export function estimatePromptTokens(messages: TokenEstimateMessage[]) {
  const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  const textEstimate = Math.ceil(totalChars / 3) + messages.length * 8;
  const attachmentEstimate = messages.reduce((sum, message) => {
    const attachments = message.attachments ?? [];
    return (
      sum +
      attachments.reduce((attachmentSum, attachment) => {
        if (attachment.type === "image") {
          return attachmentSum + estimateImagePromptTokens(attachment);
        }
        if (attachment.data) {
          return attachmentSum + Math.ceil(attachment.data.length / 3);
        }
        return attachmentSum + 600;
      }, 0)
    );
  }, 0);
  return textEstimate + attachmentEstimate;
}
