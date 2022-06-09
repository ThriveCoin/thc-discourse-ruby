# frozen_string_literal: true

describe PostActionDestroyer do
  fab!(:admin) { Fabricate(:admin) }
  fab!(:user) { Fabricate(:user) }
  fab!(:post) { Fabricate(:post) }

  describe '#perform' do
    context 'like' do
      context 'post action exists' do
        before do
          PostActionCreator.new(user, post, PostActionType.types[:like]).perform
        end

        it 'destroys the post action' do
          expect {
            PostActionDestroyer.destroy(user, post, :like)
          }.to change { PostAction.count }.by(-1)
        end

        it 'notifies subscribers' do
          expect(post.reload.like_count).to eq(1)

          messages = MessageBus.track_publish do
            PostActionDestroyer.destroy(user, post, :like)
          end

          message = messages.last.data
          expect(message[:type]).to eq(:unliked)
          expect(message[:likes_count]).to eq(0)
          expect(message[:user_id]).to eq(user.id)
        end
      end

      context 'post action doesn’t exist' do
        describe 'perform' do
          it 'fails' do
            result = PostActionDestroyer.destroy(user, post, :like)
            expect(result.success).to eq(false)
            expect(result.not_found).to eq(true)
          end
        end
      end
    end

    context 'any other notifiable type' do
      before do
        PostActionCreator.new(user, post, PostActionType.types[:spam]).perform
      end

      it 'destroys the post action' do
        expect {
          PostActionDestroyer.destroy(user, post, :spam)
        }.to change { PostAction.count }.by(-1)
      end

      it 'notifies subscribers' do
        messages = MessageBus.track_publish do
          PostActionDestroyer.destroy(user, post, :spam)
        end

        expect(messages.last.data[:type]).to eq(:acted)
      end
    end
  end
end
