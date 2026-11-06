// The words of global-error, the same as `errors` in messages/he.json, which
// stays their source (tooling/messages.test.ts checks they match). Next.js loads
// the global-error chunk with every page and the provider is gone by the time
// it shows, so importing the message file there would make every page download
// all of it, for a screen almost nobody sees.
export const globalErrorCopy = {
  title: "משהו השתבש",
  body: "המסך לא נטען בגלל תקלה. אפשר לנסות שוב בעוד רגע.",
  retry: "לנסות שוב",
  home: "חזרה לבית",
};
