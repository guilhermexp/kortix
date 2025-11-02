import { searchWebWithExa } from "./src/services/exa-search";

async function testSearchWeb() {
  console.log("=".repeat(60));
  console.log("Testing searchWeb with Exa API");
  console.log("=".repeat(60));

  try {
    console.log("\n🔍 Test 1: Simple search");
    const query1 = "Claude AI capabilities";
    console.log(`Query: "${query1}"`);

    const results1 = await searchWebWithExa(query1, {
      limit: 3,
      boostRecency: false,
    });

    console.log(`\n✅ Found ${results1.length} results\n`);

    results1.forEach((result, index) => {
      console.log(`${index + 1}. ${result.title}`);
      console.log(`   URL: ${result.url}`);
      console.log(`   Score: ${result.score}`);
      console.log(`   Snippet: ${result.snippet?.substring(0, 100)}...`);
      console.log();
    });

    console.log("\n" + "=".repeat(60));
    console.log("🔍 Test 2: Recent search with boostRecency");
    const query2 = "AI news 2025";
    console.log(`Query: "${query2}"`);

    const results2 = await searchWebWithExa(query2, {
      limit: 3,
      boostRecency: true,
    });

    console.log(`\n✅ Found ${results2.length} results\n`);

    results2.forEach((result, index) => {
      console.log(`${index + 1}. ${result.title}`);
      console.log(`   URL: ${result.url}`);
      console.log(`   Published: ${result.publishedAt || "N/A"}`);
      console.log();
    });

    console.log("\n" + "=".repeat(60));
    console.log("✅ All tests passed! searchWeb is working correctly.");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  }
}

testSearchWeb();
