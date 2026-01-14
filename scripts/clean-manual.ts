import fs from "fs";
import path from "path";

const MANUAL_DIR = path.join(process.cwd(), "manual");

function isSpecialLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed === "" ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("|") ||
    trimmed.startsWith("![")
  );
}

function isListItem(line: string): boolean {
  return line.trim().startsWith("-");
}

function cleanMarkdown(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inContent = false;

  // First pass: extract content
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip frontmatter
    if (trimmed === "---" && i < 5) {
      while (i < lines.length && !(lines[i].trim() === "---" && i > 0)) {
        i++;
      }
      continue;
    }

    // Start capturing content at first real heading
    if (trimmed.startsWith("# ") && !inContent) {
      inContent = true;
    }

    if (!inContent) continue;

    // Stop at footer sections
    if (
      trimmed === "Table of Contents" ||
      trimmed.startsWith("![](https://www.frcmanual.com/fabworks") ||
      trimmed.includes("Need custom laser cut robot parts?") ||
      trimmed === "* * *"
    ) {
      break;
    }

    result.push(line);
  }

  // Replace <br> tags
  let text = result.join("\n");
  text = text.replace(/<br>\s*/g, " ");
  text = text.replace(/<br>/g, " ");
  text = text.replace(/\r\n/g, "\n");

  // Pre-process: Join lines that start with punctuation to previous line
  text = text.replace(/\n\n*([,;:.\)])/g, "$1");

  // Pre-process: Join lines that are just closing punctuation
  text = text.replace(/\n\n*(\)\s*\.)/g, "$1");

  // Second pass: group consecutive text lines into paragraphs
  const allLines = text.split("\n");
  const output: string[] = [];
  let textBuffer: string[] = [];

  function flushBuffer() {
    if (textBuffer.length > 0) {
      const joined = textBuffer
        .map((l) => l.trim())
        .join(" ")
        .replace(/ {2,}/g, " ")
        .trim();
      if (joined) output.push(joined);
      textBuffer = [];
    }
  }

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const trimmed = line.trim();

    if (isSpecialLine(line)) {
      flushBuffer();
      output.push(line);
    } else if (isListItem(line)) {
      flushBuffer();
      // For list items, collect the item and any continuation lines
      let listItem = trimmed;
      while (i + 1 < allLines.length) {
        const nextLine = allLines[i + 1];
        const nextTrimmed = nextLine.trim();
        // Continue if next line is not special and not another list item
        if (
          nextTrimmed &&
          !isSpecialLine(nextLine) &&
          !isListItem(nextLine) &&
          !nextTrimmed.startsWith("#") &&
          !nextTrimmed.startsWith("_")
        ) {
          i++;
          listItem += " " + nextTrimmed;
        } else {
          break;
        }
      }
      output.push(listItem);
    } else if (trimmed.startsWith("_")) {
      flushBuffer();
      // Figure/Table captions - collect until we see the closing underscore or special line
      let caption = trimmed;
      while (i + 1 < allLines.length) {
        const nextLine = allLines[i + 1];
        const nextTrimmed = nextLine.trim();

        // Stop if we hit a special line
        if (
          isSpecialLine(nextLine) ||
          isListItem(nextLine) ||
          nextTrimmed.startsWith("#")
        ) {
          break;
        }

        // If caption already ends with underscore, stop
        if (caption.endsWith("_") && caption.length > 1) {
          break;
        }

        i++;
        caption += " " + nextTrimmed;
      }
      output.push(caption.replace(/ {2,}/g, " "));
    } else {
      // Regular text line - add to buffer
      textBuffer.push(line);
    }
  }
  flushBuffer();

  text = output.join("\n");

  // Clean up
  text = text.replace(/ {2,}/g, " ");
  text = text.replace(/ +([.,!?;:])/g, "$1");
  text = text.replace(/ 's /g, "'s ");
  text = text.replace(/ 's$/gm, "'s");
  text = text.replace(/ 's([.,!?;:])/g, "'s$1");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/\\#/g, "#");
  text = text.replace(/\\\\/g, "");
  text = text.replace(/\\n/g, " ");
  text = text.replace(/\\ /g, " ");

  // Remove trailing whitespace
  text = text
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n");

  text = text.trim() + "\n";

  return text;
}

async function main() {
  const files = fs.readdirSync(MANUAL_DIR).filter((f) => f.endsWith(".md"));

  console.log(`Found ${files.length} markdown files to clean\n`);

  for (const file of files) {
    const filePath = path.join(MANUAL_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const cleaned = cleanMarkdown(content);

    fs.writeFileSync(filePath, cleaned);
    console.log(`✅ Cleaned: ${file}`);
  }

  console.log("\nDone!");
}

main();
