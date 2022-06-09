# frozen_string_literal: true

describe WebCrawlerRequest do
  before do
    CachedCounting.reset
    CachedCounting.enable
  end

  after do
    CachedCounting.disable
  end

  it "can log crawler requests" do
    freeze_time
    d1 = Time.now.utc.to_date

    4.times do
      WebCrawlerRequest.increment!("Googlebot")
    end

    WebCrawlerRequest.increment!("Bingbot")

    freeze_time 1.day.from_now
    d2 = Time.now.utc.to_date

    WebCrawlerRequest.increment!("Googlebot")
    WebCrawlerRequest.increment!("Superbot")

    CachedCounting.flush

    expect(WebCrawlerRequest.find_by(date: d2, user_agent: "Googlebot").count).to eq(1)
    expect(WebCrawlerRequest.find_by(date: d2, user_agent: "Superbot").count).to eq(1)

    expect(WebCrawlerRequest.find_by(date: d1, user_agent: "Googlebot").count).to eq(4)
    expect(WebCrawlerRequest.find_by(date: d1, user_agent: "Bingbot").count).to eq(1)
  end

end
