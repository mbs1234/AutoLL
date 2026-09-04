import Screen from '../Screen';

export default function News() {
  return (
    <Screen title="BG1 News">
      <iframe
        src="https://mbs1234.github.io/bg1/news.html"
        className="absolute inset-0 w-full h-full"
      />
    </Screen>
  );
}
