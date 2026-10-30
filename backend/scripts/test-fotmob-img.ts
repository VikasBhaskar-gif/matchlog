async function main() {
  const url = "https://images.fotmob.com/image_resources/playerimages/696679.png";
  const res = await fetch(url);
  console.log("Image status:", res.status);
  console.log("Content-Type:", res.headers.get("content-type"));
  console.log("Content-Length:", res.headers.get("content-length"));
}

main().catch(console.error).finally(() => process.exit(0));
