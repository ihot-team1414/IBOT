/**
 * Test script to verify sandbox filesystem operations work correctly
 * This tests the core mechanics without needing Convex or the full agent
 */

import { createBashTool } from "bash-tool";

async function testSandboxMemory() {
  console.log("🧪 Testing Sandbox Filesystem Operations\n");

  // 1. Create a sandbox with initial files (mimicking our setup)
  console.log("1️⃣ Creating sandbox with initial files...");
  
  const initialFiles = {
    "team-files/notes/.gitkeep": "",
    "team-files/manual/test.md": "# Test Manual\n\nThis is a test.",
    "team-files/README.md": "# Team Files\n\nTest readme.",
  };

  const bashToolResult = await createBashTool({
    files: initialFiles,
  });

  const { sandbox } = bashToolResult;
  console.log("✅ Sandbox created\n");

  // 2. List initial directory structure
  console.log("2️⃣ Checking initial directory structure...");
  const lsResult = await sandbox.executeCommand("ls -la team-files/");
  console.log("ls team-files/:");
  console.log(lsResult.stdout);
  
  const lsNotesResult = await sandbox.executeCommand("ls -la team-files/notes/");
  console.log("ls team-files/notes/:");
  console.log(lsNotesResult.stdout);

  // 3. Write a new file via bash (simulating agent behavior)
  console.log("3️⃣ Writing a new file via bash command...");
  const writeResult = await sandbox.executeCommand(
    'echo "We decided on swerve drive for better maneuverability" > team-files/notes/drivetrain.md'
  );
  console.log("Write exit code:", writeResult.exitCode);
  console.log("Write stderr:", writeResult.stderr || "(none)");

  // 4. Verify the file was created
  console.log("\n4️⃣ Verifying file was created...");
  const verifyResult = await sandbox.executeCommand("cat team-files/notes/drivetrain.md");
  console.log("cat result:");
  console.log("  stdout:", JSON.stringify(verifyResult.stdout));
  console.log("  exitCode:", verifyResult.exitCode);

  // 5. Test find command (the problematic operation)
  console.log("\n5️⃣ Testing find command...");
  
  // Try relative path
  const findRelative = await sandbox.executeCommand(
    "find team-files/notes -type f 2>/dev/null"
  );
  console.log("find team-files/notes -type f:");
  console.log("  stdout:", JSON.stringify(findRelative.stdout));
  console.log("  exitCode:", findRelative.exitCode);

  // Try absolute path
  const findAbsolute = await sandbox.executeCommand(
    "find /workspace/team-files/notes -type f 2>/dev/null"
  );
  console.log("\nfind /workspace/team-files/notes -type f:");
  console.log("  stdout:", JSON.stringify(findAbsolute.stdout));
  console.log("  exitCode:", findAbsolute.exitCode);

  // 6. Test reading files found by find
  console.log("\n6️⃣ Testing file reading from find results...");
  
  const findOutput = findRelative.stdout.trim() || findAbsolute.stdout.trim();
  if (findOutput) {
    const filePaths = findOutput.split("\n").filter(Boolean);
    console.log("Files found:", filePaths);

    for (const filePath of filePaths) {
      // Try cat command
      const catResult = await sandbox.executeCommand(`cat "${filePath}"`);
      console.log(`\ncat "${filePath}":`);
      console.log("  exitCode:", catResult.exitCode);
      console.log("  stdout:", JSON.stringify(catResult.stdout));
      console.log("  stderr:", catResult.stderr || "(none)");

      // Try sandbox.readFile API
      try {
        const content = await sandbox.readFile(filePath);
        console.log(`sandbox.readFile("${filePath}"):`);
        console.log("  content:", JSON.stringify(content));
      } catch (err) {
        console.log(`sandbox.readFile("${filePath}"): ERROR -`, err);
      }
    }
  } else {
    console.log("❌ No files found!");
  }

  // 7. Test pwd to understand working directory
  console.log("\n7️⃣ Checking working directory...");
  const pwdResult = await sandbox.executeCommand("pwd");
  console.log("pwd:", pwdResult.stdout.trim());

  // 8. Full directory tree
  console.log("\n8️⃣ Full directory tree...");
  const treeResult = await sandbox.executeCommand(
    "find . -type f 2>/dev/null | head -20"
  );
  console.log("find . -type f:");
  console.log(treeResult.stdout);

  // 9. Simulate our getFiles function
  console.log("\n9️⃣ Simulating getFiles function...");
  const files = {};
  
  const findResult = await sandbox.executeCommand(
    'find team-files/notes -type f 2>/dev/null || find /workspace/team-files/notes -type f 2>/dev/null || true'
  );

  if (findResult.stdout.trim()) {
    const foundPaths = findResult.stdout.trim().split('\n').filter(Boolean);
    
    for (const filePath of foundPaths) {
      const catResult = await sandbox.executeCommand(`cat "${filePath}"`);
      
      if (catResult.exitCode === 0) {
        const relativePath = filePath.replace(/^\/workspace\//, '');
        const content = catResult.stdout;
        
        if (content || !relativePath.endsWith('.gitkeep')) {
          files[relativePath] = content;
        }
      }
    }
  }

  console.log("\nSimulated getFiles result:");
  console.log("  File count:", Object.keys(files).length);
  console.log("  Files:", Object.keys(files));
  for (const [path, content] of Object.entries(files)) {
    console.log(`  - ${path}: ${content.length} chars`);
    console.log(`    Preview: "${content.substring(0, 50)}..."`);
  }

  // 10. Test extractUserFiles filter (mimics lib/memory/index.ts)
  console.log("\n🔟 Testing extractUserFiles filter...");
  function extractUserFiles(allFiles) {
    const userFiles = {};
    for (const [path, content] of Object.entries(allFiles)) {
      if (path.startsWith("team-files/notes/")) {
        userFiles[path] = content;
      }
    }
    return userFiles;
  }
  
  const userFiles = extractUserFiles(files);
  console.log("Filtered user files:", Object.keys(userFiles));
  console.log("User files count:", Object.keys(userFiles).length);

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 SUMMARY");
  console.log("=".repeat(50));
  console.log(`Initial files: ${Object.keys(initialFiles).length}`);
  console.log(`Files retrieved from sandbox: ${Object.keys(files).length}`);
  console.log(`Files after extractUserFiles filter: ${Object.keys(userFiles).length}`);
  
  const success = Object.keys(userFiles).some(f => f.includes('drivetrain.md'));
  if (success) {
    console.log("\n✅ SUCCESS: Memory persistence should work!");
    console.log("Files that would be saved to Convex:");
    for (const [path, content] of Object.entries(userFiles)) {
      console.log(`  - ${path} (${content.length} chars)`);
    }
  } else {
    console.log("\n❌ FAILURE: No files would be saved to Convex!");
  }
}

testSandboxMemory().catch(console.error);
