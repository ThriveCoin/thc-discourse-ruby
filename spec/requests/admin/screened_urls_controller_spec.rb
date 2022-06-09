# frozen_string_literal: true

describe Admin::ScreenedUrlsController do
  it "is a subclass of AdminController" do
    expect(Admin::ScreenedUrlsController < Admin::AdminController).to eq(true)
  end

  describe '#index' do
    before do
      sign_in(Fabricate(:admin))
    end

    it 'returns JSON' do
      Fabricate(:screened_url)
      get "/admin/logs/screened_urls.json"
      expect(response.status).to eq(200)
      json = response.parsed_body
      expect(json.size).to eq(1)
    end
  end
end
